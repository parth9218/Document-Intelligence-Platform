# Ingestion Flow Design Decisions

This document records the finalized ingestion pipeline design decisions made during
the pre-implementation brainstorm session. These decisions are canonical and should
not be changed without updating the relevant task specifications and ADRs.

---

## 1. Upload Initialization & Presigned URL — Batch API

🔴 *This section overrides the original one-call-per-file design. See ADR-015.*

**Decision:** `POST /api/documents` accepts an **array** of file metadata objects in a single request body. One API call per user file selection event (not one per file).

Validation is two-tiered:

**Tier 1 — Per-file (independent, produces `rejected` result entries):**
- `mimeType` not in allowlist → `rejected`, `error: 'invalid_mime_type'`
- `fileSizeBytes < 1` or `> 5242880` → `rejected`, `error: 'file_too_large'`

Files failing tier-1 checks are included in the response as `rejected`. No DB records are created for them.

**Tier 2 — Batch-level (atomic, applied to the valid subset after tier 1):**
- Concurrency: `active_count + valid_batch_count > 5` → HTTP 429, entire batch rejected
- Storage quota: `existing_bytes + SUM(valid file sizes) > 52428800` → HTTP 400, entire batch rejected

If either batch-level check fails, **no DB records are created for any file in the batch**.

**On batch-level success**, for each valid file:
1. Generate a `document_id` (UUID).
2. Construct S3 key: `sessions/{sessionId}/documents/{documentId}/original`.
3. Generate a presigned PUT URL (5-minute TTL) with conditions: `content-length-range: [1, 5242880]`, `Content-Type: <validated mimeType>`.
4. Create `documents` row (`status = 'pending_upload'`) and `processing_jobs` row via Prisma.

**Response structure:** Always `HTTP 200 OK`. The `results` array contains one entry per input file:
- Valid files: `{ filename, status: "ready", documentId, uploadUrl, s3Key }`
- Rejected files: `{ filename, status: "rejected", error, message }`

`HTTP 400` (quota exceeded) and `HTTP 429` (concurrency exceeded) are returned only on batch-level failures, with no partial DB state.

---

## 2. Upload Confirmation Endpoint

**Decision:** `POST /api/documents/:id/confirm-upload` is a **required** endpoint.

The browser calls this immediately after receiving `200 OK` from S3. This is the
**only mechanism** that transitions `pending_upload → uploaded`.

The S3 ObjectCreated → SQS event triggers the worker's processing, not this status update.

**Rationale:** Without this endpoint, the backend has no signal that the upload succeeded.
The SQS-triggered worker only knows to begin `downloading` — it never sets `uploaded`.
The UI needs `uploaded` to immediately show "Upload Complete" after the S3 transfer finishes.

---

## 3. S3 → SQS: No Lambda Intermediary

**Decision:** S3 Event Notifications deliver directly to SQS Standard Queue.

Lambda adds cold-start failures, separate IAM trust policy complexity, and per-invocation
billing for no architectural benefit. S3 supports direct SQS delivery natively.

**Terraform requirement:** SQS queue policy must grant `s3.amazonaws.com` permission
to call `sqs:SendMessage` on the queue ARN.

---

## 4. Processing Status State Machine

**Canonical status enum (enforced by application layer, not DB enum type):**

```
pending_upload  → API created record, presigned URL issued
uploaded        → Browser called confirm-upload after S3 200 OK
downloading     → Worker fetching S3 object (worker_id and started_at set here)
validating      → Worker sniffing magic bytes, checking MIME
extracting      → Worker parsing text via PyMuPDF
chunking        → Worker splitting into paragraph chunks
embedding       → Worker generating and persisting vectors (progress_pct updates here)
completed       → All chunks embedded; document is queryable
failed          → Unrecoverable error (error_code + error_message stored)
cancelled       → User or system cancelled before completion
expired         → presigned URL TTL elapsed, never uploaded (cleanup job sets this)
```

**Terminal states:** `completed`, `failed`, `cancelled`, `expired` — no further transitions.

**Canonical transition rules:**
* `pending_upload → uploaded`: browser calls `POST /api/documents/:id/confirm-upload`
* `uploaded → downloading`: worker picks up SQS ObjectCreated message
* `downloading → validating`: worker begins magic byte inspection
* `validating → extracting`: file type confirmed valid
* `extracting → chunking`: full text extracted from all pages
* `chunking → embedding`: all chunks produced, `total_chunks` written to DB
* Any non-terminal → `failed`: exception caught; `error_code` + `error_message` set
* `pending_upload → expired`: cleanup job (records older than 30 min)
* `uploaded → failed` (`error_code = 'sqs_delivery_failure'`): cleanup job (stuck >10 min with no worker pickup)

---

## 5. Hybrid Progress Tracking (Option C)

**Decision:** Aggregate counters on `processing_jobs`, updated per batch — not per-chunk.

| DB Column          | Meaning                                               |
|--------------------|-------------------------------------------------------|
| `total_chunks`     | Set after chunking completes; denominator for progress |
| `processed_chunks` | Incremented by BATCH_SIZE after each batch persisted  |
| `progress_pct`     | `int((processed_chunks / total_chunks) * 100)`, capped at 99 until final completion |
| `checkpoint_index` | Batch index of last successfully persisted batch       |

**Batch size:** 50 chunks per batch. A 5,000-chunk document produces 100 DB writes
and 100 SSE progress events — not 5,000.

**PG NOTIFY trigger on `processing_jobs` fires on each UPDATE**, delivering the new
status/progress payload to the Express SSE stream.

---

## 6. Worker Idempotency

**Decision:** Full idempotency via three mechanisms:

1. **Chunk upsert key:** `UNIQUE (document_id, chunk_index)` on `document_chunks` enables
   `INSERT ... ON CONFLICT DO UPDATE` — safe to re-run any batch.

2. **Checkpoint resume:** `checkpoint_index` stores the last successfully persisted batch index.
   On restart, worker reads `checkpoint_index + 1` and skips already-completed batches.

3. **SQS visibility timeout as distributed lock:** 600 seconds. Prevents two workers from
   processing the same document simultaneously.

**Re-indexing path (future):** `model_version` column on `document_chunks` allows targeted
re-embedding of chunks from a specific model version without full document reprocessing.

---

## 7. DLQ Bridge

**Decision:** A secondary polling loop in the worker process reads from the DLQ every 30 seconds.

For each DLQ message: extract `document_id`, set `processing_jobs.status = 'failed'`,
`error_code = 'max_retries_exceeded'`, then delete from DLQ.

**Rationale:** Without this, documents whose SQS messages exhaust retries (max 3) will be
stuck in their last non-terminal status in the UI indefinitely.

---

## 8. Progress Update Architecture

**Decision:** Worker updates PostgreSQL directly. PG NOTIFY → Express → SSE → React.

```
Worker
  → SQLAlchemy ORM update on processing_jobs
  → PG trigger fires NOTIFY 'progress_channel'
  → Express API (LISTEN on pg driver connection)
  → SSE data frame → React browser
```

**Fallback:** React polls `GET /api/documents/:id/status` every 3 seconds on SSE disconnect.

**SSE reconnect contract:** On `EventSource.onclose`, React must either reconnect (initial
frame delivers current status) or fall back to polling. This is a Task 303 implementation requirement.

---

## 9. Orphan Record Cleanup

Two cleanup conditions handled by a scheduled job in the API service:

| Type                 | Condition                                                      | Action                                         |
|----------------------|----------------------------------------------------------------|------------------------------------------------|
| Never uploaded       | `status = 'pending_upload'` AND `created_at < NOW() - 30 min` | Set `status = 'expired'`                       |
| SQS delivery failure | `status = 'uploaded'` AND `updated_at < NOW() - 10 min`       | Set `status = 'failed'`, `error_code = 'sqs_delivery_failure'` |

Runs every 5 minutes via `setInterval` in the API service.

---

## 10. Upload Concurrency Limit

**Decision:** A maximum of **5 active (in-flight) uploads** are permitted per session at any one time. Enforced at both the API and frontend layers (see ADR-013).

**Active states** (count toward the limit):

```
pending_upload, uploaded, downloading, validating, extracting, chunking, embedding
```

**Terminal states** (do NOT count — slot freed on transition):

```
completed, failed, cancelled, expired
```

**API enforcement (batch mode):** After tier-1 per-file validation, `POST /api/documents` checks: `active_count + valid_batch_count > 5` → `HTTP 429 Too Many Requests`, entire batch rejected, no DB records created. See ADR-013.

**Frontend enforcement:** The React SPA derives the active upload count from document list state. When the count reaches 5, the file picker is disabled and an informational message is displayed.

**Rationale:** Frontend-only enforcement is bypassable via direct API calls. API enforcement provides a hard security boundary. The limit is scoped to active processing states only, so completed documents do not permanently consume concurrency slots.

---

## 11. Cumulative Session Storage Quota

**Decision:** Maximum cumulative storage per session is **50 MB**. Enforced at `POST /api/documents` via a live aggregate query before presigning. See ADR-014.

**Quota query (batch mode):** After tier-1 per-file filtering, sum `file_size_bytes` from `documents` for the current session where status is not in `{expired, failed, cancelled}`. If `existing_bytes + SUM(valid_batch_file_sizes) > 52428800`, reject the entire batch with `HTTP 400`, `error_code = 'storage_quota_exceeded'`. No DB records are created for any file in the batch. See ADR-014.

**States excluded from quota** (no active S3 storage): `expired`, `failed`, `cancelled`

**States included in quota** (occupy or will occupy S3 storage): `pending_upload`, `uploaded`, `downloading`, `validating`, `extracting`, `chunking`, `embedding`, `completed`

**Error response:** `HTTP 400` with `error_code = 'storage_quota_exceeded'` (batch-level failure, distinct from per-file `file_too_large` which produces a `rejected` entry at `HTTP 200`).

**No schema change required.** The `documents.file_size_bytes` and `documents.status` columns required for the quota query are already defined in Task 101.

**Rationale:** Batch quota must be evaluated atomically across the valid subset to prevent partial commits that would leave the session partially over quota.


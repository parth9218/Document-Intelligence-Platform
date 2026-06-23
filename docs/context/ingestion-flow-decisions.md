# Ingestion Flow Design Decisions

This document records the finalized ingestion pipeline design decisions made during
the pre-implementation brainstorm session. These decisions are canonical and should
not be changed without updating the relevant task specifications and ADRs.

---

## 1. Upload Initialization & Presigned URL Timing

**Decision:** Presigned PUT URLs are generated **after** file selection (Option B).

One `POST /api/documents` call per file. Each call:
1. Validates `mimeType` and `fileSizeBytes` server-side before presigning.
2. Creates one `documents` row and one `processing_jobs` row.
3. Returns one presigned URL valid for 5 minutes.

The presigned URL includes embedded S3 policy conditions:

- `content-length-range: [1, 5242880]` (5 MB max) 🔴 *Updated from 25 MB — see ADR-013 amendment*
- `Content-Type: <validated mimeType>` (enforces type at the S3 layer)

**File size validation:** `fileSizeBytes` must be `>= 1` and `<= 5242880` (5 MB). Requests exceeding this are rejected with `400 Bad Request` before presigning.

Multi-file upload = multiple parallel/sequential API calls.

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

**API enforcement:** `POST /api/documents` queries `documents.status` (or `processing_jobs.status`) for the current session, counting rows in any active state. If count `>= 5`, return `HTTP 429 Too Many Requests` before any DB writes or presigning occur.

**Frontend enforcement:** The React SPA maintains a count of active uploads derived from the document list state. When the count reaches 5, the file picker is disabled and an informational message is displayed. This prevents avoidable rejected API calls and provides immediate UX feedback.

**Rationale:** Frontend-only enforcement is bypassable via direct API calls. API enforcement provides a hard security boundary. The limit is scoped to active processing states only, so completed documents do not permanently consume quota.

---

## 11. Cumulative Session Storage Quota

**Decision:** Maximum cumulative storage per session is **50 MB**. Enforced at `POST /api/documents` via a live aggregate query before presigning. See ADR-014.

**Quota query:** Sum `file_size_bytes` for all documents in the session excluding statuses `expired`, `failed`, `cancelled`. If `existing_bytes + new_file_size_bytes > 52428800`, reject with `HTTP 400`.

**States excluded from quota** (no active S3 storage): `expired`, `failed`, `cancelled`

**States included in quota** (occupy or will occupy S3 storage): `pending_upload`, `uploaded`, `downloading`, `validating`, `extracting`, `chunking`, `embedding`, `completed`

**Error response:** `HTTP 400` with `error_code = 'storage_quota_exceeded'` and a human-readable message. This is distinct from the per-file size rejection (also `400`) and the concurrency rejection (`429`).

**No schema change required.** The `documents.file_size_bytes` and `documents.status` columns required for the quota query are already defined in Task 101.

**Rationale:** A denormalized counter column would require decrement logic in three separate code paths (failure handler, expiry cleanup job, cancellation handler). A live query is simpler, always accurate, and is acceptable at upload-request frequency.


# Task 103: Document Upload & Status Tracking

## Goal

Expose Express endpoints for batch presigned URL generation, upload confirmation, status polling, and SSE progress streaming. Enforce per-file validation, batch-level concurrency and storage quota limits.

---

## Scope

Implement the following routes inside `apps/api/src/routes/documents.ts`:

- `POST /api/documents` — batch initialization: validate files, enforce limits, return presigned URLs per valid file
- `POST /api/documents/:id/confirm-upload` — transition status to `uploaded` after S3 success
- `GET /api/documents/:id/status` — polling fallback for current job status
- `GET /api/documents/:id/progress` — SSE stream for real-time progress updates

Implement the orphan record cleanup job in `apps/api/src/jobs/cleanup.ts`.

**Out of scope:** Frontend upload UI, S3 bucket configuration, SQS configuration.

---

## Dependencies

- Task 101 (Database Schema — `documents`, `processing_jobs` tables and PG NOTIFY trigger must exist)
- Task 102 (API Session Management — session middleware must be active on all routes)

---

## Endpoint Specifications

### POST /api/documents

Accepts a batch of file metadata. Returns per-file outcomes. See ADR-015 and `ingestion-flow-decisions.md §1`.

**Request body:** `{ "documents": [{ "filename", "mimeType", "fileSizeBytes" }] }`

**Validation is two-tiered:**

**Tier 1 — Per-file (independent):**

Validate each file in the input array independently:
- `mimeType` not in `{application/pdf, text/plain}` → result entry: `status: "rejected"`, `error: "invalid_mime_type"`
- `fileSizeBytes < 1` or `> 5242880` → result entry: `status: "rejected"`, `error: "file_too_large"`

Files failing tier-1 are included in the response as `rejected`. No DB records are created for them.

**Tier 2 — Batch-level (atomic, on the valid subset only):**

After tier-1 filtering, apply both checks to the valid subset before any DB writes:

1. Concurrency: query `processing_jobs.status` for the current session. If `active_count + valid_batch_count > 5`, return `HTTP 429`. Active states: `{pending_upload, uploaded, downloading, validating, extracting, chunking, embedding}`. See ADR-013 and `ingestion-flow-decisions.md §10`.
2. Storage quota: sum `file_size_bytes` from `documents` for the current session where status not in `{expired, failed, cancelled}`. If `existing_bytes + SUM(valid_batch_sizes) > 52428800`, return `HTTP 400`, `error_code = 'storage_quota_exceeded'`. See ADR-014 and `ingestion-flow-decisions.md §11`.

If either batch-level check fails, no DB records are created for any file in the batch.

**On batch-level success**, for each valid file:
- Generate a `document_id` (UUID).
- Construct S3 key: `sessions/{sessionId}/documents/{documentId}/original`.
- Generate a presigned S3 PUT URL (5-minute TTL) with: `content-length-range: [1, 5242880]`, `Content-Type: <validated mimeType>`.
- Create `documents` row (`status = 'pending_upload'`) and `processing_jobs` row (`status = 'pending_upload'`, `progress_pct = 0`, `checkpoint_index = -1`) via Prisma.

**Response:** Always `HTTP 200 OK`. Body: `{ "results": [...] }` where each entry is either:
- `{ filename, status: "ready", documentId, uploadUrl, s3Key }` for valid files
- `{ filename, status: "rejected", error, message }` for rejected files

`HTTP 400` and `HTTP 429` are returned only on batch-level failures (no `results` array in that case).

---

### POST /api/documents/:id/confirm-upload

Called by the browser after receiving `200 OK` from S3. This is the **only mechanism** that transitions `pending_upload → uploaded`.

**Request body:** None.

**Required checks (in order):**

1. **Session ownership:** Load document by `:id`. If the document is not found, or `document.session_id` does not match the current session, return `HTTP 404`. Do not return `403` — a `403` would confirm the document exists to an unauthorized caller.

2. **Idempotency / status guard:** If `processing_jobs.status` is not `'pending_upload'`, return `HTTP 409 Conflict` with `error: "already_confirmed"`. This prevents double-calling from corrupting the state machine transition.

3. **Atomic status transition:** Execute a single Prisma transaction updating both records: `documents.status = 'uploaded'` and `processing_jobs.status = 'uploaded'`. Return `HTTP 200` with `{ "status": "uploaded" }`.

> **No S3 headObject call at this endpoint.** The endpoint does not verify that the S3 object exists. S3 object existence verification is performed by the Python worker during the `downloading` stage (see Task 201). This endpoint only updates DB status so the UI can immediately reflect "Upload Complete."

---

### GET /api/documents/:id/status

Polling fallback endpoint. Used when SSE is unavailable or the connection drops.

Returns `documentId`, `status`, `progressPct`, `processedChunks`, `totalChunks`, `errorCode`, `errorMessage`.

Returns `404` if the document does not exist or does not belong to the current session.

---

### GET /api/documents/:id/progress

SSE stream endpoint. Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

**Behavior:**

- On connect: send an initial `data:` frame with the current job status from DB so the client does not see a blank state on connect or reconnect.
- Open a PostgreSQL `LISTEN progress_channel` connection (via `pg` driver, not Prisma).
- On each NOTIFY payload received: parse the JSON, match `document_id` to the connected client, forward as SSE `data:` frame.
- On client disconnect (`res.on('close')`): issue `UNLISTEN progress_channel` and release the pg connection back to the pool.
- Return `404` if the document does not exist or does not belong to the current session.

**Frontend reconnect contract:** On `EventSource.onclose`, the React client must either reconnect (initial frame delivers current status) or fall back to polling `GET /api/documents/:id/status` every 3 seconds. This is a Task 303 implementation requirement.

---

## Cleanup Job: Orphan Record Management

Implement `apps/api/src/jobs/cleanup.ts`, run via `setInterval` every 5 minutes on API startup.

**Type 1 — `expired` (never uploaded):**
- Condition: `processing_jobs.status = 'pending_upload'` AND `created_at < NOW() - 30 minutes`
- Action: Set `documents.status = 'expired'` and `processing_jobs.status = 'expired'`

**Type 2 — stuck `uploaded` (SQS event never arrived):**
- Condition: `processing_jobs.status = 'uploaded'` AND `updated_at < NOW() - 10 minutes`
- Action: Set `processing_jobs.status = 'failed'`, `error_code = 'sqs_delivery_failure'`

---

## Acceptance Criteria

- `POST /api/documents` accepts a `documents` array and returns a `results` array.
- Per-file `mimeType` failure produces `status: "rejected"`, `error: "invalid_mime_type"` in the results array; overall response is `HTTP 200`.
- Per-file `fileSizeBytes` failure produces `status: "rejected"`, `error: "file_too_large"` in the results array; overall response is `HTTP 200`.
- Batch with mixed valid and invalid files returns `HTTP 200` with both `ready` and `rejected` entries; DB records are created only for `ready` files.
- Batch-level concurrency check: if `active_count + valid_batch_count > 5`, returns `HTTP 429`; no DB records created for any file.
- Batch-level quota check: if `existing_bytes + SUM(valid batch sizes) > 52428800`, returns `HTTP 400` with `error_code = 'storage_quota_exceeded'`; no DB records created for any file.
- Presigned URL includes `content-length-range: [1, 5242880]` and the validated `Content-Type` for each valid file.
- `documents` and `processing_jobs` rows created in `pending_upload` state for each `ready` file.
- `POST /api/documents/:id/confirm-upload` returns `HTTP 404` if the document does not exist or does not belong to the current session (ownership check must not return `403`).
- `POST /api/documents/:id/confirm-upload` returns `HTTP 409` with `error: "already_confirmed"` if `processing_jobs.status` is not `'pending_upload'` (idempotency guard).
- `POST /api/documents/:id/confirm-upload` atomically transitions both `documents.status` and `processing_jobs.status` to `'uploaded'` in a single transaction; returns `HTTP 200` with `{ "status": "uploaded" }`.
- `GET /api/documents/:id/status` returns current progress state including chunk counters.
- `GET /api/documents/:id/progress` SSE stream delivers an initial state frame on connect and NOTIFY-triggered frames as the worker progresses.
- All document endpoints return `404` for unowned or non-existent document IDs.
- Cleanup job marks `pending_upload` records older than 30 min as `expired`.
- Cleanup job marks stuck `uploaded` records older than 10 min as `failed` with `error_code = 'sqs_delivery_failure'`.

---

## Notes

- Concurrency check must query `processing_jobs.status` — `processing_jobs` is the authoritative status source.
- Storage quota check must query `documents.file_size_bytes` and `documents.status` — `documents` holds the file size; materialized status is sufficient for the aggregate.
- Both batch-level checks must execute after tier-1 per-file filtering and before any DB writes or S3 presigning.
- The two quota checks use different state sets: storage quota excludes `{expired, failed, cancelled}`; concurrency quota counts only the 7 active processing states. Completed documents consume storage quota but free a concurrency slot.
- Do not use application-level counters or cache for quota enforcement — always query the database to prevent race conditions under concurrent uploads.
- See `ingestion-flow-decisions.md §1` for the full batch API contract and validation sequence.
- See `ingestion-flow-decisions.md §10` and ADR-013 for the concurrency limit specification.
- See `ingestion-flow-decisions.md §11` and ADR-014 for the storage quota specification.
- See `ingestion-flow-decisions.md §9` for orphan cleanup timing parameters.

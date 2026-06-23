# Task 103: Document Upload & Status Tracking

## Goal

Expose Express endpoints for generating S3 presigned PUT URLs, confirming upload completion, polling document status, and streaming real-time ingestion progress via SSE. Enforce file size and per-session upload concurrency limits at the API layer.

---

## Scope

Implement the following routes inside `apps/api/src/routes/documents.ts`:

- `POST /api/documents` — initialize document record, enforce limits, return presigned URL
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

Initializes a document upload. One call per file.

**Request body fields:** `filename`, `mimeType`, `fileSizeBytes`

**Validations (reject before presigning, in this order):**

1. Active session must exist (enforced by session middleware from Task 102).
2. `mimeType` must be `application/pdf` or `text/plain`. Reject with `400` if invalid.
3. `fileSizeBytes` must be `>= 1` and `<= 5242880` (5 MB). Reject with `400` if exceeded.
4. Cumulative session storage quota: sum `file_size_bytes` from `documents` for the current session where status is not in `{expired, failed, cancelled}`. If `existing_bytes + fileSizeBytes > 52428800` (50 MB), reject with `400`, `error_code = 'storage_quota_exceeded'`. See ADR-014 and `ingestion-flow-decisions.md §11`.
5. Active upload concurrency: count documents for the current session with status in `{pending_upload, uploaded, downloading, validating, extracting, chunking, embedding}`. If count `>= 5`, reject with `429 Too Many Requests`. See ADR-013 and `ingestion-flow-decisions.md §10`.

**On success:**

- Generate a UUID for `document_id`.
- Construct S3 key: `sessions/{sessionId}/documents/{documentId}/original`.
- Generate a presigned S3 PUT URL (5-minute TTL) with embedded conditions:
  - `content-length-range: [1, 5242880]`
  - `Content-Type: <validated mimeType>`
- Create `documents` row (`status = 'pending_upload'`) via Prisma.
- Create `processing_jobs` row (`status = 'pending_upload'`, `progress_pct = 0`, `checkpoint_index = -1`) via Prisma.
- Return `documentId`, `uploadUrl`, `s3Key`.

---

### POST /api/documents/:id/confirm-upload

Called by the browser after receiving `200 OK` from S3. This is the **only mechanism** that transitions `pending_upload → uploaded`.

**Validations:**

- Document must belong to the current session. Return `403` if not.
- Document status must be `pending_upload`. Return `409` if already confirmed (idempotency guard).

**On success:** Atomically update `documents.status` and `processing_jobs.status` to `uploaded` in a single Prisma transaction. Return `200 OK`.

> The S3 ObjectCreated → SQS event that triggers the worker fires independently. This endpoint only updates DB status for the UI to immediately reflect "Upload Complete."

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

- `POST /api/documents` rejects `mimeType` outside `{application/pdf, text/plain}` with `400`.
- `POST /api/documents` rejects `fileSizeBytes > 5242880` with `400`.
- `POST /api/documents` rejects when `existing_session_bytes + fileSizeBytes > 52428800` with `400` and `error_code = 'storage_quota_exceeded'`.
- `POST /api/documents` rejects requests when the session has `>= 5` documents in active states with `429`.
- Active state set for concurrency quota: `{pending_upload, uploaded, downloading, validating, extracting, chunking, embedding}`.
- Included state set for storage quota: all statuses except `{expired, failed, cancelled}`.
- Presigned URL includes `content-length-range: [1, 5242880]` and the validated `Content-Type`.
- `documents` and `processing_jobs` rows created in `pending_upload` state on success.
- `POST /api/documents/:id/confirm-upload` atomically transitions both rows to `uploaded`; returns `409` on double-call.
- `GET /api/documents/:id/status` returns current progress state including chunk counters.
- `GET /api/documents/:id/progress` SSE stream delivers an initial state frame on connect and NOTIFY-triggered frames as the worker progresses.
- All document endpoints return `404` for unowned or non-existent document IDs.
- Cleanup job marks `pending_upload` records older than 30 min as `expired`.
- Cleanup job marks stuck `uploaded` records older than 10 min as `failed` with `error_code = 'sqs_delivery_failure'`.

---

## Notes

- Upload quota check must query `processing_jobs.status` (not `documents.status`) — `processing_jobs` is the authoritative status source.
- The storage quota check (step 4) must query `documents.file_size_bytes` and `documents.status` directly — `documents` holds the file size and the materialized status is sufficient for this aggregate.
- All validation checks (steps 2–5) must execute **before** any DB writes or S3 presigning to avoid partial state on rejection.
- Do not implement quota enforcement using an application-level counter or cache — always read from the database to avoid race conditions under concurrent uploads.
- The two quota checks use different state sets: storage quota excludes only `{expired, failed, cancelled}`; concurrency quota counts only the 7 active processing states. Completed documents consume storage quota but free a concurrency slot.
- See `ingestion-flow-decisions.md §11` and ADR-014 for the canonical storage quota specification.
- See `ingestion-flow-decisions.md §10` and ADR-013 for the canonical concurrency limit specification.
- See `ingestion-flow-decisions.md §1` for the canonical file size limit specification.
- See `ingestion-flow-decisions.md §9` for orphan cleanup timing parameters.

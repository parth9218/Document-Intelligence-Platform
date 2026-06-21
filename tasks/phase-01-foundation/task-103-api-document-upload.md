# Task 103: Document Upload & Status Tracking

## Goal
Expose Express endpoints for generating S3 presigned PUT URLs, confirming browser-side
upload completion, polling document status, and streaming real-time ingestion progress
via Server-Sent Events (SSE).

## Scope
Implement the following routes inside `apps/api` using Express and Prisma Client:
* `POST /api/documents` — initialize document record and return presigned URL
* `POST /api/documents/:id/confirm-upload` — browser calls this after S3 upload succeeds
* `GET /api/documents/:id/status` — polling fallback for current job status
* `GET /api/documents/:id/progress` — SSE stream for real-time progress updates

## Files Expected To Change
* `apps/api/src/routes/documents.ts`
* `apps/api/src/services/s3.ts`
* `apps/api/src/services/progress.ts`
* `apps/api/src/jobs/cleanup.ts` (new — orphan record cleanup)

## Dependencies
* Task 101 (Database Schema)
* Task 102 (API Session Management)

---

## Endpoint Specifications

### POST /api/documents
Initializes a document upload. One call per file (multi-file = multiple calls).

**Request body:**
```json
{ "filename": "report.pdf", "mimeType": "application/pdf", "fileSizeBytes": 4194304 }
```

**Validations (reject with 400 before presigning):**
* `mimeType` must be `application/pdf` or `text/plain`
* `fileSizeBytes` must be `>= 1` and `<= 26214400` (25 MB)
* Active session must exist (enforced by session middleware from Task 102)

**Actions:**
1. Generate a `document_id` (UUID).
2. Construct S3 key: `sessions/{sessionId}/documents/{documentId}/original`.
3. Generate a presigned S3 PUT URL (5-minute TTL) with embedded conditions:
   * `content-length-range: [1, 26214400]`
   * `Content-Type: <validated mimeType>`
4. Create `documents` row (`status = 'pending_upload'`) via Prisma.
5. Create `processing_jobs` row (`status = 'pending_upload'`, `progress_pct = 0`, `checkpoint_index = -1`) via Prisma.

**Response:**
```json
{ "documentId": "uuid", "uploadUrl": "https://...", "s3Key": "sessions/.../original" }
```

---

### POST /api/documents/:id/confirm-upload
Called by the browser immediately after receiving a `200 OK` from the S3 presigned URL.
This is the **only mechanism** that transitions `pending_upload → uploaded`.

**Actions:**
1. Verify the document belongs to the current session (403 if not).
2. Verify the document's current status is `pending_upload` (409 if already confirmed).
3. Update `documents.status = 'uploaded'` and `processing_jobs.status = 'uploaded'` in a single Prisma transaction.
4. Return `200 OK`.

> **Note:** The S3 ObjectCreated → SQS event that triggers the worker is fired independently
> by AWS. This endpoint only updates the DB status so the UI can immediately reflect
> "Upload Complete" without waiting for the worker to pick up the message.

---

### GET /api/documents/:id/status
Polling fallback endpoint. Used when SSE is unavailable or the connection drops.

**Response:**
```json
{
  "documentId": "uuid",
  "status": "embedding",
  "progressPct": 64,
  "processedChunks": 320,
  "totalChunks": 500,
  "errorCode": null,
  "errorMessage": null
}
```

* Returns 404 if document does not exist or does not belong to the current session.

---

### GET /api/documents/:id/progress
SSE stream. Establishes a `text/event-stream` connection.

**Implementation:**
1. Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
2. Send an initial `data:` frame with the current job status (fetched from DB) so the client
   does not see a blank state on connect or reconnect.
3. Open a PostgreSQL `LISTEN progress_channel` connection (via `pg` driver, not Prisma).
4. On each NOTIFY payload received: parse the JSON, match `document_id` to the connected
   client, and forward as an SSE `data:` frame.
5. On client disconnect (`res.on('close')`): issue `UNLISTEN progress_channel` and release
   the pg connection back to the pool.

**Frontend reconnect contract:**
The React client must handle `EventSource.onclose` by either reconnecting (which receives
the current status in the initial frame) or falling back to polling `GET /api/documents/:id/status`
every 3 seconds. This must be documented in Task 303.

---

## Cleanup Job: Orphan Record Management

Implement a scheduled cleanup job (`apps/api/src/jobs/cleanup.ts`) to handle two orphan types:

### Type 1 — `expired` (never uploaded)
* Condition: `processing_jobs.status = 'pending_upload'` AND `created_at < NOW() - INTERVAL '30 minutes'`
* Action: Set `documents.status = 'expired'` and `processing_jobs.status = 'expired'`
* Rationale: Presigned URL TTL is 5 minutes; 30 minutes is a conservative cleanup window.

### Type 2 — stuck `uploaded` (SQS event never arrived)
* Condition: `processing_jobs.status = 'uploaded'` AND `updated_at < NOW() - INTERVAL '10 minutes'`
* Action: Set `processing_jobs.status = 'failed'` with `error_code = 'sqs_delivery_failure'`
* Rationale: If the worker has not picked up the job within 10 minutes of upload confirmation,
  the SQS ObjectCreated event was lost or S3 notification is misconfigured.

Run both checks every 5 minutes via `setInterval` on API startup.

---

## Acceptance Criteria
* `POST /api/documents` generates a 5-minute presigned URL with Content-Type and size conditions embedded.
* DB records created in `documents` (`status = 'pending_upload'`) and `processing_jobs`
  (`status = 'pending_upload'`, `progress_pct = 0`, `checkpoint_index = -1`).
* `POST /api/documents/:id/confirm-upload` atomically transitions both rows to `status = 'uploaded'`.
* `GET /api/documents/:id/status` returns current progress state including chunk counters.
* `GET /api/documents/:id/progress` SSE stream delivers an initial state frame on connect and
  subsequent NOTIFY-triggered frames as the worker progresses.
* SSE connection on wrong/unowned document ID returns 404.
* Cleanup job marks `pending_upload` records older than 30 min as `expired` and stuck
  `uploaded` records older than 10 min as `failed`.

## Validation Steps
1. `POST /api/documents` with valid session cookie — verify presigned URL returned.
2. Assert DB rows created in `pending_upload` state.
3. Call `POST /api/documents/:id/confirm-upload` — verify both rows transition to `uploaded`.
4. Establish SSE connection to `/api/documents/:id/progress` — manually update `processing_jobs`
   status/progress via psql and verify SSE event received.
5. Verify requesting status/progress of unowned document ID returns 404.
6. Advance clock or manually age a `pending_upload` record past 30 min and run cleanup job —
   verify it transitions to `expired`.

## Definition Of Done
* All four endpoints validated.
* Confirm-upload endpoint tested for idempotency (double-call returns 409, does not corrupt state).
* Cleanup job validated for both orphan types.
* Test suite asserts session-tenancy isolation on all document endpoints.

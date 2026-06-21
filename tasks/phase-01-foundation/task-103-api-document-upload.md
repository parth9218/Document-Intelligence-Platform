# Task 103: Document Upload & Status Tracking

## Goal
Expose Express endpoints returning S3 upload presigned URLs and tracking status updates (via polling and real-time Server-Sent Events).

## Scope
Implement `/api/documents` (presigning), `/api/documents/:id/status` (polling API), and `/api/documents/:id/progress` (SSE push API) inside `apps/api` using Express and Prisma Client.

## Files Expected To Change
* `apps/api/src/routes/documents.ts`
* `apps/api/src/services/s3.ts`
* `apps/api/src/services/progress.ts`

## Dependencies
* Task 102 (API Session Management)

## Acceptance Criteria
* `POST /api/documents` generates a 5-minute S3 presigned PUT URL scoped to S3 path `sessions/{sessionId}/documents/{documentId}/original`.
* Size (<= 25 MB) and MIME types (`application/pdf`, `text/plain`) are validated.
* DB records created in `documents` (status = `pending_upload`) and `processing_jobs` (status = `pending_upload`, progress = 0) using Prisma Client.
* `GET /api/documents/:id/status` returns current job status, progress percentage, and error state.
* `GET /api/documents/:id/progress` opens a Server-Sent Events (SSE) connection that listens to PG notifications (via `LISTEN progress_channel` on the pg driver client) and streams progress changes for that document ID to the client.

## Validation Steps
1. POST to `/api/documents` with valid session cookie. Verify S3 presigned URL is returned.
2. Assert database document and processing job entries are created in `pending_upload` state.
3. Establish SSE connection to `/api/documents/:id/progress`. Manually update DB status/progress and verify SSE event is received.
4. Verify requesting status of non-existent/unowned ID returns 404.

## Definition Of Done
* Presigned URL and status polling endpoints validated.
* Real-time progress SSE stream validated with mock database triggers.
* Test suite created asserting size validation and session-tenancy isolation.

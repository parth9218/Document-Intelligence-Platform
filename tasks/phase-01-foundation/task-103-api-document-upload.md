# Task 103: Document Upload Presigning

## Goal
Expose endpoints returning S3 upload presigned URLs and tracking status.

## Scope
Implement `/api/documents` and `/api/documents/:id/status` endpoints inside `apps/api`.

## Files Expected To Change
* `apps/api/src/routes/documents.ts`
* `apps/api/src/services/s3.ts`

## Dependencies
* Task 102 (API Session Management)

## Acceptance Criteria
* `POST /api/documents` generates a 5-minute S3 presigned PUT URL scoped to S3 path `sessions/{sessionId}/documents/{documentId}/original`.
* Size (<= 25 MB) and MIME types (`application/pdf`, `text/plain`) are validated.
* DB record created with `status=pending_upload`.

## Validation Steps
1. POST to `/api/documents` with valid session cookie. Verify S3 presigned URL is returned.
2. Assert database document entry is in `pending_upload` state.
3. Verify requesting status of non-existent/unowned ID returns 404.

## Definition Of Done
* Presigned URL endpoint validated.
* Test suite created asserting size validation and unowned ID access protection.

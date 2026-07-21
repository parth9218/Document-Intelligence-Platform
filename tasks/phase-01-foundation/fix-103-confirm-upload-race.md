# Fix 103-A: confirm-upload Idempotency Resolution

## Goal
Resolve the race condition between the frontend calling the `/confirm-upload` endpoint and the background SQS consumer worker processing the S3 ObjectCreated event. The `/confirm-upload` endpoint must be made idempotent so that if the worker has already transitioned the document out of `pending_upload` to a processing state, the endpoint returns a `200 OK` rather than a `409 Conflict` error.

## Scope
* Update the Express API's document service (`apps/api/src/services/document.service.ts`) inside the `confirmUpload` method.
* Relax the idempotency guard check:
  - If the document is currently in `pending_upload`, transition the status to `uploaded` in both the `Document` and `ProcessingJob` tables via the transaction as usual.
  - If the document's status is already `uploaded` or in any active or terminal processing state (`downloading`, `validating`, `extracting`, `chunking`, `embedding`, `completed`, `failed`), return a success response (`200 OK`) and log the event. Do NOT modify the database state in this case, preventing progress rollback.
  - If the document's status is in a non-processing terminal state where confirmation is invalid (e.g. `expired`, `cancelled`), throw a `ConflictError` as before.
* Update the Express API's unit/integration test suite to verify the idempotent behavior.

## Files Expected To Change
* `apps/api/src/services/document.service.ts`
* `apps/api/src/tests/documents.test.ts`

## Dependencies
* Task 103 (Document Upload & Status Tracking)
* Task 104 (SQS Consumer Loop)
* Task 201 (Worker Document Extraction)

## Acceptance Criteria
* The `/api/documents/:id/confirm-upload` endpoint returns `200 OK` with `{ status: 'uploaded' }` when the document is in the `pending_upload` state.
* The `/api/documents/:id/confirm-upload` endpoint returns `200 OK` with `{ status: 'uploaded' }` and ignores database updates (idempotent success) when the document's status is already `uploaded`, `downloading`, `validating`, `extracting`, `chunking`, `embedding`, `completed`, or `failed`.
* The `/api/documents/:id/confirm-upload` endpoint returns `409 Conflict` when the document is in the `expired` or `cancelled` state.
* Database status is never overwritten or rolled back (e.g. if the status was `downloading` or `completed`, it must not revert back to `uploaded`).

## Validation Steps
1. Seed the database with a document in `pending_upload` status. Call `/confirm-upload` and assert HTTP 200 is returned, and status transitions to `uploaded`.
2. Seed the database with a document in `downloading` status. Call `/confirm-upload` and assert HTTP 200 is returned, and the status in the database remains `downloading` (idempotent check passes, no overwrite).
3. Seed the database with a document in `expired` status. Call `/confirm-upload` and assert HTTP 409 Conflict is returned with `error: 'already_confirmed'`.
4. Seed the database with a document in `cancelled` status. Call `/confirm-upload` and assert HTTP 409 Conflict is returned with `error: 'already_confirmed'`.
5. Run the API test suite using `npx jest --runInBand` and verify all tests pass.

## Definition Of Done
* Idempotency logic is implemented in the `confirmUpload` method of `document.service.ts`.
* Tests in `documents.test.ts` are updated/created to cover the idempotent success paths (e.g., when the document is already in the `downloading` state) as well as HTTP 409 Conflict error tests for `expired` and `cancelled` states.
* Integration tests pass successfully.

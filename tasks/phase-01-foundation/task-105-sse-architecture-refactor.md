# Task 105: SSE Architecture Refactor (ADR-017)

## Goal

Migrate the existing per-document SSE and status endpoints to session-scoped equivalents, and update the PG NOTIFY trigger to use a session-scoped channel. This task brings the implemented codebase into conformance with ADR-017, which supersedes ADR-008.

## Scope

**Included:**
- New Prisma migration: overwrites `notify_progress_channel()` trigger function with session-scoped channel
- Remove `GET /api/documents/:id/status` route and controller method
- Remove `GET /api/documents/:id/progress` route and controller method
- Add `GET /api/documents/status` route, controller method, and service method
- Add `GET /api/documents/progress` route, controller method, and service method
- Update Jest integration tests in `apps/api/src/tests/documents.test.ts` to remove per-document SSE/status tests and add session-scoped equivalents

**Excluded:**
- Schema table changes (no new columns or tables required)
- `POST /api/documents` and `POST /api/documents/:id/confirm-upload` (unaffected)
- Worker service changes
- Frontend changes (covered in Frontend Phase 4 & Phase 5)

## Dependencies

- Task 101 (DB schema and initial trigger migration already applied to the database)
- Task 102 (session middleware must be active on all routes)
- Task 103 (batch upload and confirm-upload implementations must exist and remain unchanged)

## Acceptance Criteria

- A new Prisma migration file exists and applies cleanly via `npx prisma migrate dev`.
- After migration, `SELECT prosrc FROM pg_proc WHERE proname = 'notify_progress_channel'` shows `replace(NEW.session_id::text, '-', '_')` in the NOTIFY call.
- `GET /api/documents/:id/status` and `GET /api/documents/:id/progress` routes do not exist and return `404` if called.
- `GET /api/documents/status` returns `{ "documents": [] }` for a session with no documents.
- `GET /api/documents/status` returns a `{ "documents": [...] }` array where each item conforms to the `DocumentStatusObject` shape defined in Task 103.
- `GET /api/documents/progress` establishes an SSE connection, emits `event: snapshot` immediately on connect with a JSON array of all session document statuses, and emits `event: update` frames on each PG NOTIFY received on `progress_{sessionId}`.
- `event: update` frames include all `DocumentStatusObject` fields including `filename`, `mimeType`, `fileSizeBytes`, and `createdAt` (enriched from snapshot cache — no additional DB query per notification).
- The pg Pool connection used for `LISTEN` is released on client disconnect via `UNLISTEN progress_{sessionId}`.
- All integration tests pass after the refactor (`npm test -- --runInBand`).
- Existing tests for `POST /api/documents` and `POST /api/documents/:id/confirm-upload` remain green.

## Notes

- The new migration must use `CREATE OR REPLACE FUNCTION notify_progress_channel()` — it does NOT need `DROP FUNCTION` or `DROP TRIGGER`. The existing trigger binding (`processing_jobs_notify`) continues to call the same function name and does not need to be recreated.
- The PG LISTEN channel string is `'progress_' || replace(session_id, '-', '_')` derived in Express from the authenticated session ID. The trigger uses the same formula on `NEW.session_id`. Both sides must use identical string derivation.
- Route ordering matters: `GET /status` and `GET /progress` must be registered as static routes before any dynamic `/:id` routes on the same router to prevent Express from capturing them as document IDs.
- The service method for `connectProgressStream` must be replaced entirely. The new session-scoped version takes only `sessionId` (no `documentId`), performs the snapshot query, and returns both the snapshot array and the metadata cache map.
- See ADR-017 in `DECISIONS.md` for the full decision rationale.
- See `ingestion-flow-decisions.md §8` for the unified `DocumentStatusObject` schema and payload enrichment requirements.
- See `database-schema-spec.md §4` for the updated trigger SQL and migration history note.

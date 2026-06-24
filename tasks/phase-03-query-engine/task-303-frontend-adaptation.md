# Task 303: Frontend Progress & Streaming Integration

## Goal
Adapt the React SPA frontend to track upload progress, monitor worker ingestion progress in real-time, and display streaming chat responses with interactive citation tooltips.

## Scope
Update React hooks, file upload forms, progress indicators, and chat layout components inside `apps/frontend`.

Includes:
- Batch file selection with one `POST /api/documents` call per selection event
- Per-file `results` array processing: surface `ready` files for upload, surface `rejected` entries as inline errors
- Upload file picker with concurrency enforcement (disable when active uploads >= 5)
- Browser-side S3 upload progress tracking per file
- Worker ingestion progress via SSE (with polling fallback)
- Streaming chat responses with citation bubbles

## Files Expected To Change
* `apps/frontend/src/components/ChatInterface.tsx`
* `apps/frontend/src/components/DocumentUpload.tsx`
* `apps/frontend/src/hooks/useIngestion.ts`
* `apps/frontend/src/hooks/useQuery.ts`

## Dependencies
* Task 103 (Document Upload & Status Tracking)
* Task 302 (Grounded Generation, SSE Streaming & Citations)

## Acceptance Criteria
* **Batch Upload Handling**: File selection triggers a single `POST /api/documents` with all selected files. The frontend processes the `results` array: files with `status: "ready"` proceed to S3 upload; files with `status: "rejected"` display inline per-file error messages (`invalid_mime_type`, `file_too_large`). If the API returns `HTTP 429`, display a session concurrency error. If `HTTP 400` with `storage_quota_exceeded`, display a session quota error.
* **S3 Upload Mechanism (presigned POST)**: For each `ready` file, construct a `FormData` object. Append every key-value pair from `uploadFields` in the order received, then append the actual file last. Send a multipart POST to `uploadUrl`. Do NOT use a PUT request. After receiving a `2xx` response from S3 (presigned POST returns `204 No Content`), call `POST /api/documents/:id/confirm-upload` to transition DB status to `uploaded`.
* **Browser-Side Upload Progress**: Track and display per-file S3 upload percentage (0–100%) using `xhr.upload.onprogress` or equivalent. XHR-based progress tracking is compatible with the multipart FormData POST mechanism.
* **Worker Ingestion Progress Bar**:
  * Establish a single SSE connection to `GET /api/documents/progress` (session-scoped; covers all documents). On `EventSource` open, handle the `snapshot` event to initialize state for all session documents. Handle subsequent `update` events to merge incremental progress into state by `documentId`.
  * Fallback: on SSE disconnect, poll `GET /api/documents/status` every 3 seconds. The response `{ "documents": [...] }` uses the same `DocumentStatusObject` shape as `snapshot` event data — use the same parsing function for both.
  * Render a per-document progress bar tracking: "Downloading file..." → "Extracting text..." → "Chunking pages..." → "Embedding vectors (X% done)..." → "Completed!".
* **Streaming Chat & Citations**:
  * Connect to `/api/query` SSE stream to receive token-by-token answer frames.
  * Render stream in real-time. Parse bracket citations (`[1]`) into clickable bubble components.
  * Hovering or clicking on a citation bubble opens a popover detailing `doc_name`, `page_number`, and the specific referenced text snippet.

## Validation Steps
1. Start local stack, API server, worker, and frontend dev server.
2. Select a PDF and click upload: check that the file upload progress bar updates smoothly.
3. Once uploaded, check that the processing progress bar updates from downloading, extracting, to chunking, and embedding (with dynamic percentages).
4. Send a chat query, verify response streams token by token, and confirm citations display correct metadata on click.
5. Initiate 5 concurrent uploads. Verify the file picker is disabled and an informational message appears. Complete or fail one upload; verify the picker re-enables.

---

## Notes
- The active upload count must be derived from local document state (not a separate `/api/session/quota` call) to avoid excess API round-trips.
- Do not hard-code the limit value in the component; source it from a shared constants file to keep it consistent with the API enforcement value (5).
- SSE reconnect behavior: on `EventSource.onclose`, the client must reconnect to `GET /api/documents/progress` or fall back to polling `GET /api/documents/status`. The `snapshot` event on reconnect delivers current state for all documents, so reconnect is safe at any point in processing.
- SSE uses named event types: `snapshot` (array, fired once on connect) and `update` (single object, fired per progress change). Use `eventSource.addEventListener('snapshot', handler)` and `eventSource.addEventListener('update', handler)` — not `eventSource.onmessage`.
- The `DocumentStatusObject` shape (used in both `snapshot` array items and `update` frames, and in the `GET /api/documents/status` response) is defined in `ingestion-flow-decisions.md §8`. Use a single shared parser/type for all three sources.
- S3 upload uses presigned POST (not PUT). `uploadFields` from the API response must all be appended to `FormData` before the file. Missing any `uploadFields` entry will cause S3 to reject the upload. See ADR-016 and `ingestion-flow-decisions.md §1`.
- S3 presigned POST returns `204 No Content` (not `200 OK`) on success. The confirm-upload call must be triggered on any `2xx` response, not specifically `200`.
- See ADR-013 for the full dual-layer enforcement rationale.
- See ADR-017 for the full session-scoped SSE architecture rationale.

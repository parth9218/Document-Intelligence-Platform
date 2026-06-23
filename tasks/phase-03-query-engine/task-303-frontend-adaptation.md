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
* **Browser-Side Upload Progress**: Track and display raw S3 file upload percentage (0-100%) dynamically using browser `xhr.upload.onprogress` or equivalent fetch wrappers.
* **Worker Ingestion Progress Bar**:
  * Establish SSE connection to `/api/documents/:id/progress` (fallback to polling `/api/documents/:id/status` every 3 seconds if SSE fails or disconnects).
  * Render a progress bar tracking the worker through states: "Downloading file..." -> "Extracting text..." -> "Chunking pages..." -> "Embedding vectors (X% done)..." -> "Completed!".
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
- SSE reconnect behavior: on `EventSource.onclose`, the client must reconnect or fall back to polling — the initial SSE frame always delivers the current status, so reconnect is safe at any point in processing.
- See ADR-013 for the full dual-layer enforcement rationale.

# Task 303: Frontend Progress & Streaming Integration

## Goal
Adapt the React SPA frontend to track upload progress, monitor worker ingestion progress in real-time, and display streaming chat responses with interactive citation tooltips.

## Scope
Update React hooks, file upload forms, progress indicators, and chat layout components inside `apps/frontend`.

## Files Expected To Change
* `apps/frontend/src/components/ChatInterface.tsx`
* `apps/frontend/src/components/DocumentUpload.tsx`
* `apps/frontend/src/hooks/useIngestion.ts`
* `apps/frontend/src/hooks/useQuery.ts`

## Dependencies
* Task 103 (Document Upload & Status Tracking)
* Task 302 (Grounded Generation, SSE Streaming & Citations)

## Acceptance Criteria
* **Browser-Side Upload Progress**: Track and display raw S3 file upload percentage (0-100%) dynamically using browser `xhr.upload.onprogress` or equivalent fetch wrappers.
* **Worker Ingestion Progress Bar**:
  * Establish SSE connection to `/api/documents/:id/progress` (fallback to polling `/api/documents/:id/status` every 3 seconds if SSE fails).
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

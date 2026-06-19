# Task 303: Frontend Integration

## Goal
Adapt the React SPA frontend to poll ingestion status and render streamed query results with citations.

## Scope
Update React hooks, file upload forms, and chat message layouts in `apps/frontend`.

## Files Expected To Change
* `apps/frontend/src/components/ChatInterface.tsx`
* `apps/frontend/src/hooks/useIngestion.ts`

## Dependencies
* Task 103 (Upload Presigning)
* Task 302 (Grounded Generation)

## Acceptance Criteria
* Frontend performs direct uploads to S3 using presigned URLs.
* Polls ingestion status route `/api/documents/:id/status` every 3 seconds while processing.
* Connects to `/api/query` using EventSource/SSE and renders citations interactively.

## Validation Steps
1. Start API, LocalStack, and React Vite development server.
2. Complete full flow: upload file -> see status bar progress -> chat with file -> click citation link.

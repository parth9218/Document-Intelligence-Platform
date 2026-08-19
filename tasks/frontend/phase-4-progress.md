# Frontend Phase 4 Tasks: Real-Time Processing & Progress Visualizer

This file details the tasks required to build the progress sync hook (SSE + Polling) and render processing feed cards.

---

## Task F4.1: SSE Client & Polling Fallback Hook

### Goal
Implement the `useIngestion` progress tracking hook to capture real-time document updates via EventSource, with fallback to status polling on network failure.

### Scope
Create the SSE connection wrapper, register EventSource handlers for named events, and configure the backup polling loop.

### Files Expected To Change
* `apps/frontend/src/hooks/useIngestion.ts`
* `apps/frontend/src/lib/sse-client.ts`

### Dependencies
* Task F3.3, Task 105 (SSE Refactor)

### Acceptance Criteria
* **Named Event Routing**: Connect to `GET /api/documents/progress` using EventSource. Add custom listeners:
  - `snapshot`: Parse JSON array and initialize documents list in Zustand.
  - `update`: Parse single object payload and update that record by ID in Zustand.
* **Polling Fallback**: If the SSE connection fails, start polling `GET /api/documents/status` every 3 seconds. Terminate polling if SSE successfully reconnects.
* **Mock SSE Simulation**: In `'mock'` mode, MSW simulates the SSE channel, emitting progressive extraction and chunking events.
* **Lifecycle Controls**: Clean up EventSource connections and disable polling loops once all documents reach terminal states (`completed`, `failed`, `expired`).

### Validation Steps
1. Initiate processing on a document. Inspect network connections to confirm SSE connection is active.
2. Simulate connection loss (e.g. offline mode). Confirm that the client transitions to polling `GET /api/documents/status` every 3 seconds.
3. Bring connection back online. Confirm the polling loop terminates and SSE resumes.

### Definition Of Done
* Progress tracking hook dynamically updates Zustand state via SSE with a fallback polling system.

---

## Task F4.2: Document Processing Feed & Progress Indicators

### Goal
Create status tracking cards showing progress details for text extraction, chunking, and embedding.

### Scope
Design the processing status feed layout, document details card, and phase progress bars.

### Files Expected To Change
* `apps/frontend/src/components/documents/document-card.tsx`
* `apps/frontend/src/components/documents/processing-feed.tsx`

### Dependencies
* Task F4.1

### Acceptance Criteria
* **Processing Layout**: Cards render state tags mapping to the document processing lifecycle: Downloading, Validating, Extracting, Chunking, Embedding, and Completed.
* **Granular Messaging**: Show sub-stage details:
  - "Chunking (4 of 8 chunks)..." using `processedChunks` and `totalChunks`.
  - "Embedding (50% complete)..." using `progressPct`.
* **Orphan Cleanup Interceptor**: If a document transitions to `failed` or `expired` (triggered by the API orphan cleanup job), change the card border to an amber/red warning glow, display the error details, and render dismiss/retry buttons.

### Validation Steps
1. Run local processing. Verify that status cards show stages transitioning.
2. Manually set document status to `expired` in the mock data. Verify that the card border updates to a warning glow and renders retry buttons.

### Definition Of Done
* Document status cards and progress indicators display real-time sub-stage updates.

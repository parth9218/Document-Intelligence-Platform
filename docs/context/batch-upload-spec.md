# Batch Upload Queue & Controller Specification

This document details the architectural design, implementation parameters, and error-mitigation paths of the batch upload engine implemented in Task F3.2.

---

## 1. Core Architecture

The frontend uses `useUpload` (a custom React hook) to orchestrate batch uploads. It coordinates with the Zustand store (`localProgressQueue`, `documentRegistry`) and communicates with the backend API to initialize and confirm uploads.

```mermaid
graph TD
    %% Define Nodes
    Zone[UploadZone Component] -->|Selected Files| Hook[useUpload Hook]
    Hook -->|POST /api/documents| API[Express API Server]
    
    %% API Response & Classification
    API -->|Batch Initialization Response| Hook
    Hook -->|Classify Items| Classify{Status Classifier}
    
    Classify -->|Rejected status| Reg[documentRegistry Zustand]
    Classify -->|Ready status| Queue[localProgressQueue Zustand]
    
    %% Parallel Executions
    Queue -->|Throttled Task Pool| Pool{Concurrency Pool Limit}
    Pool -->|Active Task <= 5| Upload[Mock / S3 Upload Engine]
    Pool -->|Wait Queue| Queue
    
    Upload -->|204 No Content| Confirm[POST /api/documents/:id/confirm-upload]
    Confirm -->|Uploaded| Done[Clear local progress, SSE takes over]
    Upload -->|Failure| Fail[Transition status to failed in registry]
```

---

## 2. Queue Classification Flow

When files are passed to `useUpload`, they undergo two phases of classification and verification:

1. **Batch Registration & Initialization (`POST /api/documents`)**:
   - The hook registers the entire batch of files in a single request.
   - The backend validates session limits (cumulative 50MB storage quota and maximum 5 concurrent processing documents).
   - If the session limit is exceeded, the server responds with `400 storage_quota_exceeded` or `429 rate_limit_exceeded`. The hook intercepts these and shows a global modal dialog box.

2. **Per-File Evaluation**:
   - The backend returns an array of `results`, one for each document in the batch.
   - **`rejected` Items**: Added directly to `documentRegistry` with a status of `failed`, carrying the specific validation error (`invalid_mime_type` or `file_too_large`). These are rendered with red inline error messages below the filename.
   - **`ready` Items**: Added to the `localProgressQueue` with a status of `initializing`. These proceed to the concurrent upload queue.

---

## 3. Concurrency Pool Controller

To prevent resource exhaustion and browser rate-limiting, uploads are throttled to a maximum of 5 concurrent operations:

- **Asynchronous Queue Loop**:
  - The orchestrator maintains an array of `tasks` (ready files) and an `activeCount` counter.
  - Up to 5 concurrent promises are kicked off.
  - Each task executes, simulating upload progress and invoking `confirm-upload` on completion.
  - When a task resolves, it decrements `activeCount` and recursively triggers the next available task in the queue, ensuring the promise pool is always saturated at exactly 5 (or fewer) active uploads.
  - By using `await runNext()`, the pool is guaranteed to resolve the batch promise only when all tasks are complete.

---

## 4. UI Elements & Integration

### Interactive Upload Zone
- Monitored by the Zustand store. If the number of active uploads (local progress items + non-terminal backend items) is $\ge 5$, the zone locks itself, disabling clicks/drops and showing a warning banner.

### Inline Errors
- Failed items in `documentRegistry` display their specific validation or network error message inline on the dashboard file list, allowing users to troubleshoot individual rejections.

### Global Error Dialog Modal
- Exposes a glassmorphic dialog modal overlay when a batch registration fails due to session-level constraints (quota/rate limits), allowing users to dismiss and resolve the issue.

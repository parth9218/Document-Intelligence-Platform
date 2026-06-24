# Frontend Phase 3 Tasks: Batch Upload & S3 Ingestion Flow

This file details the tasks required to build the drag-and-drop file picker, batch upload state hook, direct S3 upload engine, and confirmation integration.

---

## Task F3.1: Drag-and-Drop Picker UI

### Goal
Implement the file selector interface supporting dragging events and validation parameters.

### Scope
Create picker component frames, configure type limits, and apply sizing constraints.

### Files Expected To Change
* `apps/frontend/src/components/upload/upload-zone.tsx`

### Dependencies
* Task F2.3

### Acceptance Criteria
* **Visual States**: The upload zone changes styling using Tailwind transitions (glow adjustments, dashed border borders, background opacity shifts) on file drag.
* **Pre-flight Checks**: Enforce local type validation (only allow `application/pdf`, `text/plain`) and local file size checks (size must be between 1B and 5,242,880B / 5MB).
* **Concurrency Lock**: Read active uploads list from Zustand. If the upload count >= 5, disable selection triggers and display an warnings banner.

### Validation Steps
1. Attempt dropping a 6MB file. Verify that the picker displays an immediate validation warning and rejects the upload.
2. Queue 5 files and assert the drop zone is locked.

### Definition Of Done
* Drag-and-drop zone with sizing/mime validations is fully functional.

---

## Task F3.2: Batch Initialization & Queue Controller Hook

### Goal
Implement `useUpload` hook to orchestrate batch uploads, coordinate API parameters, and handle quota errors.

### Scope
Implement batch file initialization hooks and update Zustand active upload tracking arrays.

### Files Expected To Change
* `apps/frontend/src/hooks/useUpload.ts`
* `apps/frontend/src/store/useAppStore.ts`

### Dependencies
* Task F3.1, Task 103 (Upload API)

### Acceptance Criteria
* **Batch Request Execution**: Group selected files and make a single call to initialize uploads.
* **Quota/Concurrency Interceptor**: Handle HTTP `429` (too many files) and HTTP `400` with `storage_quota_exceeded` by alerting the user.
* **Queue Classification**: Inspect the `results` payload:
  - Add items with `status: "rejected"` directly to the queue with their backend-supplied error mappings (e.g. `invalid_mime_type`, `file_too_large`).
  - Route items marked `status: "ready"` to the S3 upload queue, and update `localProgressQueue` state.
* **Concurrency Limit Execution**: Enforce that a maximum of 5 concurrent uploads execute in parallel.

### Validation Steps
1. Select 6 files. Verify that the client displays a concurrency error dialog.
2. Select files containing a mix of valid and invalid files. Assert that ready documents proceed to upload while invalid files show inline errors.

### Definition Of Done
* The batch queue controller is implemented, manages upload state, and coordinates parallel upload tasks.

---

## Task F3.3: Multipart Presigned POST S3 Upload & Confirmation Handback

### Goal
Implement the S3 direct upload engine using multipart `FormData` and native progress monitoring, followed by the confirmation handoff.

### Scope
Build the S3 uploader module, construct FormData payloads, track progress via XHR, and invoke confirm-upload routes.

### Files Expected To Change
* `apps/frontend/src/lib/s3-uploader.ts`
* `apps/frontend/src/hooks/useUpload.ts`

### Dependencies
* Task F3.2, Task 103 (Upload API)

### Acceptance Criteria
* **FormData Order Compliance**: For each document, build a `FormData` object. Append all fields in `uploadFields` *exactly in the order received*, and append the `file` payload *last*.
* **Native Progress Tracking**: Issue multipart POST requests to `uploadUrl` using an `XMLHttpRequest` wrapper to capture `onprogress` callbacks. In `'mock'` mode, MSW simulates dynamic file transmission.
* **Confirm Upload**: On receiving a `2xx` response (S3 returns `204 No Content` for presigned POST uploads), call `POST /api/documents/{id}/confirm-upload` to transition the status to `uploaded`.
* **Error Handling**: On failure (S3 network block, verification drops), transition the document state to `failed` and display descriptive error details.

### Validation Steps
1. Upload a valid document to S3 (or mock worker). Verify that the upload progress bar updates smoothly.
2. Check network logs to verify that `POST /confirm-upload` is called right after S3 returns 204.

### Definition Of Done
* Files are uploaded directly to S3 and confirmed successfully on the backend.

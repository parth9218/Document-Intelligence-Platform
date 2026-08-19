# Task 104: SQS Consumer Loop

## Goal
Implement the core Python polling loop that consumes messages from SQS and dispatches
them to the document processing pipeline.

## Scope
Create `apps/worker/worker.py` — a Python daemon that long-polls SQS using boto3,
dispatches messages to the processing pipeline, handles failures, and supports
graceful shutdown.

## Files Expected To Change
* `apps/worker/worker.py`
* `apps/worker/requirements.txt`

## Dependencies
None

---

## SQS Configuration

| Parameter            | Value        | Rationale                                               |
|----------------------|--------------|---------------------------------------------------------|
| `WaitTimeSeconds`    | 20           | Long polling — avoids empty receive costs               |
| `MaxNumberOfMessages`| 1            | Process one document at a time per worker pod           |
| `VisibilityTimeout`  | 600 (10 min) | Enough time for extraction + chunking of a 25 MB file   |
| `MaxReceiveCount`    | 3            | Configured on SQS queue (Terraform); after 3 failed attempts message moves to DLQ |

---

## Message Format

S3 ObjectCreated events arrive from SQS with the following structure:

```json
{
  "Records": [{
    "s3": {
      "bucket": { "name": "documents-bucket" },
      "object": { "key": "sessions/{sessionId}/documents/{documentId}/original" }
    }
  }]
}
```

The worker extracts `sessionId` and `documentId` from the S3 object key.

---

## Processing Dispatch Contract

The worker calls a `process_document(document_id, session_id, s3_key)` function
(implemented in Phase 2 tasks). On return:

* **Success** → call `sqs.delete_message()` to remove message from queue.
* **Transient failure** (network error, DB timeout) → do NOT delete; let visibility timeout
  expire so SQS re-delivers the message for retry (up to `MaxReceiveCount = 3`).
* **Permanent failure** (invalid file type, corrupt PDF) → update DB to `status = 'failed'`
  then call `sqs.delete_message()` to prevent unnecessary retries.

---

## DLQ Bridge

After 3 failed attempts, SQS moves the message to the Dead Letter Queue (DLQ).
The UI will show the document stuck in its last status forever without intervention.

Implement a **DLQ poller** as a secondary loop in the same worker process:
* Poll the DLQ for messages.
* For each DLQ message: extract `document_id`, update `processing_jobs.status = 'failed'`
  with `error_code = 'max_retries_exceeded'`, then delete from DLQ.
* Run DLQ poll loop every 30 seconds (vs main queue's continuous polling).

---

## Graceful Shutdown

Register SIGTERM and SIGINT handlers:
* Set a `shutdown_requested` flag.
* Allow the current message to finish processing before exiting.
* Do NOT call `delete_message` on a partially-processed document — let the SQS visibility
  timeout return it to the queue for retry.

```python
import signal

shutdown_requested = False

def handle_signal(signum, frame):
    global shutdown_requested
    shutdown_requested = True

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)
```

---

## Acceptance Criteria
* Poller calls `ReceiveMessage` with `WaitTimeSeconds=20` and `MaxNumberOfMessages=1`.
* Visibility timeout is set to 600 seconds.
* Successful processing → `delete_message` called.
* Permanent failure → DB updated to `failed`, then `delete_message` called.
* Transient failure → message NOT deleted (visibility timeout handles re-delivery).
* SIGTERM handler sets shutdown flag; current message processing completes before exit.
* DLQ poller loop marks DLQ-routed documents as `failed` in DB.

## Validation Steps
1. Spin up LocalStack SQS queue (main + DLQ).
2. Send a dummy S3 event JSON payload to queue.
3. Start the worker script. Verify SQS message is fetched, parsed, dispatched, and deleted.
4. Send a message that triggers a permanent failure. Verify DB `status = 'failed'` and message deleted.
5. Kill worker mid-processing with SIGTERM. Verify current message completes before exit.
6. Send a message to the DLQ directly. Verify DLQ poller updates DB to `failed`.

## Definition Of Done
* Worker starts, polls queue, handles all termination signals, and correctly routes
  success vs transient vs permanent failures.
* DLQ bridge prevents documents from being stuck in intermediate states.

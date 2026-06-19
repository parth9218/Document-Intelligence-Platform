# Task 104: SQS Consumer Loop

## Goal
Implement the core Python polling loop that consumes messages from SQS.

## Scope
Create a custom Python script `apps/worker/worker.py` polling SQS using `boto3`.

## Files Expected To Change
* `apps/worker/worker.py`
* `apps/worker/requirements.txt`

## Dependencies
None

## Acceptance Criteria
* Poller calls SQS `ReceiveMessage` with long polling enabled (`WaitTimeSeconds=20`).
* Gracefully processes failures, releasing or deleting messages based on outcomes.
* Integrates SIGTERM signal handlers for graceful shutdown (finishes current message before exiting).

## Validation Steps
1. Spin up LocalStack SQS queue.
2. Send a dummy JSON payload to queue.
3. Start the worker script. Verify SQS message is fetched, parsed, and logged.

## Definition Of Done
* Worker script starts, polls queue, handles termination signals, and successfully processes test messages.

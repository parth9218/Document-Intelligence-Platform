# Task 402: Prometheus & Loki Integration

## Goal
Expose application metrics and format structured JSON log statements.

## Scope
Implement `/metrics` route in API, add Prometheus counters in Worker, and structure log modules.

## Files Expected To Change
* `apps/api/src/services/logger.ts`
* `apps/worker/logger.py`

## Dependencies
None

## Acceptance Criteria
* Expose `/metrics` containing API request latencies, active sessions, and errors.
* Worker logs SQS messages processed and timing values.
* All log outputs follow JSON format carrying keys: `sessionId`, `documentId`, `spanId`.

## Validation Steps
1. Fetch `/metrics` endpoint. Verify standard Prometheus variables.
2. Trigger errors and check that logs print in valid structured JSON format.

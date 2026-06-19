# Task 401: OpenTelemetry Instrumentation

## Goal
Set up OpenTelemetry SDKs to trace requests across Node.js API and Python Worker.

## Scope
Instrument Node.js express routes and Python boto3 clients with OpenTelemetry packages.

## Files Expected To Change
* `apps/api/src/instrumentation.ts`
* `apps/worker/instrumentation.py`

## Dependencies
* Task 302 (Grounded Generation)

## Acceptance Criteria
* API calls capture transaction traces matching S3, SQS, Bedrock, and PostgreSQL requests.
* SQS metadata injects trace contexts to correlate Worker processing with API uploads.

## Validation Steps
1. Run API and Worker with OpenTelemetry Jaeger/Tempo exporter enabled.
2. Execute ingestion and query actions. Assert traces are collected.

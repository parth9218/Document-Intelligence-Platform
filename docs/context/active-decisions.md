# Active Architectural Decisions

This document summarizes active decisions currently being implemented.

## Decoupled Polyglot Architecture
* **Node.js Express TypeScript API**: Concurrency handling and streaming.
* **Python boto3 Worker**: Async text ingestion and Bedrock integration.
* **S3 direct uploads**: Frontend fetches presigned URLs from API and uploads directly to S3.
* **Amazon SQS Queue**: Handoff mechanism from S3 to Worker.
* **pgvector**: RDS PostgreSQL with HNSW similarity index (`m=16`, `ef_construction=64`).

## Local Testing & Mock Environments
* **Localstack**: Used to mock S3 and SQS locally.
* **Local pgvector**: Enforce database parity by running pgvector in a local Docker container.
* **Local LLM Providers**: Support for local models (e.g. Ollama, Sentence-Transformers) to bypass Bedrock API costs during local execution. Controlled via `EMBEDDING_PROVIDER=local` env var.

## Upload & Ingestion Flow
* **Presigned URL timing**: URLs generated after file selection (Option B). One API call per file.
* **Presigned URL policy conditions**: Content-Type and content-length-range embedded into S3 policy at signing time.
* **Confirm-upload endpoint**: `POST /api/documents/:id/confirm-upload` is the only mechanism to transition `pending_upload → uploaded`. Browser calls it after S3 returns 200 OK.
* **S3 → SQS (no Lambda)**: S3 Event Notifications deliver directly to SQS. No intermediate Lambda.
* **SQS parameters**: `WaitTimeSeconds=20`, `MaxNumberOfMessages=1`, `VisibilityTimeout=600`, `MaxReceiveCount=3`.

## Processing Status State Machine
Full canonical status enum: `pending_upload → uploaded → downloading → validating → extracting → chunking → embedding → completed`.
Error states: `failed`, `cancelled`, `expired`. See `docs/context/ingestion-flow-decisions.md` for full transition rules.

## Progress Tracking
* **Hybrid model (Option C)**: Aggregate counters (`total_chunks`, `processed_chunks`, `progress_pct`, `checkpoint_index`) on `processing_jobs`. Updated per batch of 50 chunks, not per individual chunk.
* **PG NOTIFY trigger**: Fires on every `processing_jobs` UPDATE, powering the SSE stream.

## Idempotency & Resumability
* **Upsert key**: `UNIQUE (document_id, chunk_index)` on `document_chunks` enables `ON CONFLICT DO UPDATE`.
* **Checkpoint resume**: `checkpoint_index` on `processing_jobs` tracks last persisted batch index.
* **Re-indexing**: `model_version` on `document_chunks` for future targeted re-embedding.

## DLQ & Orphan Cleanup
* **DLQ bridge**: Secondary loop in worker polls DLQ every 30s; sets `status = 'failed'` with `error_code = 'max_retries_exceeded'`.
* **Orphan cleanup**: API service scheduled job (every 5 min) sets `expired` for un-uploaded records >30 min old and `failed` for stuck `uploaded` records >10 min with no worker pickup.

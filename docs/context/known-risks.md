# Known Risks & Mitigations

This registry lists potential issues and their mitigation strategies.

## 1. Bedrock Titan Embeddings Throttle Limit
* **Risk**: Titan API requests can hit throughput limits under heavy batch uploads.
* **Mitigation**: Implement exponential backoff with max 3 retries inside `apps/worker/embeddings.py`. Initial delay 1s, multiplier 2x. Retry on `ThrottlingException` and `ServiceUnavailableException` only.

## 2. Vector Cosine Similarity Search Performance
* **Risk**: High concurrent searches can degrade database query latency.
* **Mitigation**: Configure HNSW index parameters (`m=16`, `ef_construction=64`) and route connections through RDS Proxy.

## 3. Session Cleanup Integrity
* **Risk**: S3 objects and Postgres rows can become orphaned if cleanup workers fail.
* **Mitigation**: Enforce cascading DB foreign key deletions (session → documents → chunks + jobs), and write explicit S3 bucket lifecycle policies as a backstop.

## 4. SQS Delivery Failure (Missing ObjectCreated Event)
* **Risk**: Browser calls `confirm-upload` successfully, but the S3 ObjectCreated → SQS notification is never delivered (S3 notification misconfiguration, SQS policy error). Document gets stuck in `uploaded` state.
* **Mitigation**: Cleanup job in API service marks `processing_jobs.status = 'failed'` with `error_code = 'sqs_delivery_failure'` for `uploaded` records with no worker activity after 10 minutes.

## 5. Worker Crash Mid-Batch (Partial Embedding)
* **Risk**: Worker crashes after embedding batch N but before persisting it. On restart, the worker must not re-embed batches 0..N-1, but also must not skip batch N.
* **Mitigation**: `checkpoint_index` records the index of the last **successfully persisted and committed** batch. Restart reads `checkpoint_index + 1`. Batch N is the resume point. Since `ON CONFLICT DO UPDATE` is used, re-processing batch N is idempotent.

## 6. SQLAlchemy Model Drift from Prisma Schema
* **Risk**: Prisma schema changes (migrations) are not reflected in `apps/worker/models.py`, causing silent data mapping errors or runtime exceptions.
* **Mitigation**: Add a note to every Prisma migration PR checklist requiring manual sync of `apps/worker/models.py`. Consider a CI lint check comparing column names.

## 7. PG NOTIFY Payload Size Limit
* **Risk**: PostgreSQL `pg_notify()` payloads have an 8 KB limit. If the NOTIFY JSON grows (e.g., error messages are very long), the notification is silently dropped.
* **Mitigation**: Keep NOTIFY payloads minimal (status, progress_pct, chunk counts, error_code only). Truncate `error_message` to 500 characters before including it in the NOTIFY payload.

## 8. Documents Stuck in Processing After Session Expiry
* **Risk**: A session expires and is deleted (CASCADE). The worker still holds a reference to the now-deleted `document_id` and will fail trying to update `processing_jobs`.
* **Mitigation**: Worker must handle `NoResultFound` and `ForeignKeyViolation` SQLAlchemy exceptions gracefully — log the event and call `sqs.delete_message()` without retrying.

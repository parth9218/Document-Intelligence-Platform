# Task 203: Worker Vector Storage

## Goal
Persist chunk text and embeddings to pgvector PostgreSQL.

## Scope
Implement batch database insertion and progress tracking database operations in `apps/worker`.

## Files Expected To Change
* `apps/worker/db.py`
* `apps/worker/worker.py`

## Dependencies
* Task 202 (Worker Embedding Generation)

## Acceptance Criteria
* Vectors and metadata committed in batch transactional operations.
* Chunk injection updates database document record to `ready` upon complete success.
* Ingestion chunk progress checkpointing implemented to resume ingestion from last chunk on failure.

## Validation Steps
1. Run full ingestion flow on local mock environment.
2. Assert chunks exist in `document_chunks` table.
3. Assert document status changes to `ready` and contains vector values.

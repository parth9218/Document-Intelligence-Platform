# Task 203: Worker Vector Storage & Status Updates (SQLAlchemy ORM)

## Goal
Persist chunk text and vector embeddings to PostgreSQL, and update progress logging tables using SQLAlchemy ORM sessions.

## Scope
Implement batch ORM model insertion, transactional progress checkpointing, and progress-tracking database session operations inside `apps/worker/db.py` and `apps/worker/worker.py`.

## Files Expected To Change
* `apps/worker/db.py`
* `apps/worker/worker.py`
* `apps/worker/requirements.txt`

## Dependencies
* Task 202 (Worker Embedding Generation)

## Acceptance Criteria
* **No Raw SQL**: Inserts and updates are executed purely via SQLAlchemy models and sessions (e.g. `session.add_all()`, `session.commit()`).
* Progress percentage is updated in the database `ProcessingJob` model incrementally as batches are completed:
  * Formula: `progress = 30 + (processed_chunks / total_chunks) * 65` (reserving 30% for extraction/chunking phases).
  * Update table fields: `status = 'embedding'`, `processed_chunks`, and `progress_percentage`.
* On failure, worker updates `ProcessingJob.status = 'failed'` and sets the `error_message`.
* Upon complete success, worker updates the `Document.status = 'ready'`, `ProcessingJob.status = 'completed'`, and `progress_percentage = 100` within a single database transaction.
* Ingestion checkpointing is implemented: if a document fails mid-way, the worker queries existing chunks via SQLAlchemy to resume from the last successfully indexed chunk.

## Validation Steps
1. Run full ingestion flow in local mock environment.
2. Assert database document state updates dynamically (e.g. tracking intermediate percentages).
3. Verify chunks exist in the `document_chunks` table, mapped to correct pages.
4. Verify document status becomes `ready` and job status becomes `completed` when finished.

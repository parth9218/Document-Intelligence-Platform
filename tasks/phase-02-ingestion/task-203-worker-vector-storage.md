# Task 203: Worker Vector Storage & Job Progress Updates (SQLAlchemy ORM)

## Goal
Idempotently persist chunk text and vector embeddings to PostgreSQL via SQLAlchemy ORM,
update processing progress after each batch, support checkpoint-based resume on retry,
and mark documents as complete.

## Scope
Implement batch ORM upsert logic, transactional progress checkpointing, and final
completion marking inside `apps/worker/db.py` and `apps/worker/worker.py`.

## Files Expected To Change
* `apps/worker/db.py`
* `apps/worker/worker.py`
* `apps/worker/models.py` (SQLAlchemy ORM models mirroring Prisma schema)
* `apps/worker/requirements.txt`

## Dependencies
* Task 202 (Worker Chunking & Embedding — provides batch input)

---

## SQLAlchemy Models

Define models in `apps/worker/models.py` mirroring the Prisma-generated schema exactly.
**Prisma Migrate is the single source of truth** — SQLAlchemy models must be kept in sync
manually whenever the Prisma schema changes.

Key model requirements:
* `DocumentChunk.embedding` mapped with pgvector's custom type:
  ```python
  from pgvector.sqlalchemy import Vector
  embedding = Column(Vector(1024))
  ```
* All models inherit from a shared `Base = declarative_base()`.

---

## Idempotent Chunk Upsert

Each batch of chunks is persisted using `INSERT ... ON CONFLICT DO UPDATE`:

```python
from sqlalchemy.dialects.postgresql import insert

def upsert_chunks(session, chunks: list[dict]) -> None:
    stmt = insert(DocumentChunk).values(chunks)
    stmt = stmt.on_conflict_do_update(
        index_elements=['document_id', 'chunk_index'],   # UNIQUE constraint key
        set_={
            'embedding':     stmt.excluded.embedding,
            'content':       stmt.excluded.content,
            'token_count':   stmt.excluded.token_count,
            'model_version': stmt.excluded.model_version,
            'updated_at':    func.now(),
        }
    )
    session.execute(stmt)
    session.commit()
```

This makes every batch safe to re-run without duplicating rows.

---

## Checkpoint-Based Resume

On entry to `process_document()`, before processing begins, read the current `checkpoint_index`:

```python
job = session.query(ProcessingJob).filter_by(document_id=document_id).one()
resume_batch_index = job.checkpoint_index + 1   # -1 means start from 0
```

Pass `resume_batch_index` to the chunker/embedder pipeline. Skip batches with index
`< resume_batch_index` — do not re-embed them.

This ensures that a worker restarting after a crash does not re-process completed batches.

---

## Per-Batch Progress Update

After each batch is persisted, update progress atomically:

```python
processed = (batch_index + 1) * BATCH_SIZE   # BATCH_SIZE = 50
progress   = int((processed / total_chunks) * 100)

session.query(ProcessingJob).filter_by(document_id=document_id).update({
    'processed_chunks': min(processed, total_chunks),
    'progress_pct':     min(progress, 99),   # Reserve 100% for final completion
    'checkpoint_index': batch_index,
    'status':           'embedding',
})
session.commit()
# PG NOTIFY fires here via trigger → SSE frame delivered to browser
```

**Progress formula:** Linear across batches. `progress_pct` is capped at 99 until the
final completion transaction to avoid prematurely showing 100%.

---

## Completion Transaction

On successful processing of all batches, perform a single final transaction:

```python
with session.begin():
    session.query(ProcessingJob).filter_by(document_id=document_id).update({
        'status':           'completed',
        'progress_pct':     100,
        'processed_chunks': total_chunks,
        'checkpoint_index': total_batches - 1,
        'completed_at':     func.now(),
    })
    session.query(Document).filter_by(id=document_id).update({
        'status': 'completed',
    })
```

Both updates in one transaction. If this transaction fails, the job remains at 99%
in `embedding` state — the cleanup job or manual intervention addresses this edge case.

---

## Failure Handling

On any unrecoverable exception during persistence:

```python
session.query(ProcessingJob).filter_by(document_id=document_id).update({
    'status':        'failed',
    'error_code':    'persistence_failed',
    'error_message': str(e),
})
session.commit()
```

Then propagate the exception so the worker calls `sqs.delete_message()` (permanent failure
path in Task 104 — prevents unnecessary SQS retries on DB-level failures).

---

## Acceptance Criteria
* **No Raw SQL**: All inserts and updates use SQLAlchemy ORM only.
* Chunk upsert uses `ON CONFLICT (document_id, chunk_index) DO UPDATE` — no duplicates on retry.
* `checkpoint_index` is updated after each batch.
* Worker resumes from `checkpoint_index + 1` on restart (re-embedding already-persisted batches is not performed).
* `progress_pct` increments linearly per batch (never prematurely shows 100%).
* Completion transaction atomically sets both `ProcessingJob.status = 'completed'` and `Document.status = 'completed'`.
* `model_version = 'titan-embed-text-v2'` stored on every chunk.
* Failure path sets `error_code = 'persistence_failed'` and triggers SQS message deletion.

## Validation Steps
1. Run full ingestion on a test PDF in local mock environment.
2. Assert `document_chunks` rows exist with correct `content`, `page_number`, `chunk_index`, and `model_version`.
3. Assert `processing_jobs.progress_pct` increments in steps (not all at once).
4. Kill worker mid-batch. Restart. Assert it resumes from the correct `checkpoint_index` without re-inserting completed chunks.
5. Verify final DB state: `documents.status = 'completed'`, `processing_jobs.status = 'completed'`, `progress_pct = 100`.
6. Intentionally cause a DB error mid-batch. Assert `processing_jobs.status = 'failed'` with `error_code = 'persistence_failed'`.

## Definition Of Done
* Idempotent upsert validated via deliberate retry (no duplicate rows).
* Checkpoint resume validated via crash-and-restart test.
* Full pipeline runs end-to-end in local environment with pgvector and Localstack.

# Task 101: Database Schema Creation via Prisma ORM

## Goal
Establish the full PostgreSQL database schema including pgvector tables, session state,
processing job tracking, chunk storage, and the PG NOTIFY trigger using Prisma schema
in the TypeScript Express API.

## Scope
Write `apps/api/prisma/schema.prisma` mapping all database tables and types.
Generate and apply migrations using Prisma Migrate. Create the PG NOTIFY trigger
via a custom migration SQL file.

## Files Expected To Change
* `apps/api/prisma/schema.prisma`
* `apps/api/prisma/migrations/<timestamp>_init/migration.sql` (auto-generated + trigger appended)
* `apps/api/package.json`

## Dependencies
None

---

## Schema Specification

### `sessions`
| Column         | Type          | Constraints                              |
|----------------|---------------|------------------------------------------|
| id             | UUID          | PRIMARY KEY, default gen_random_uuid()   |
| session_token  | TEXT          | UNIQUE NOT NULL (HMAC-signed value)      |
| created_at     | TIMESTAMPTZ   | DEFAULT NOW()                            |
| last_active_at | TIMESTAMPTZ   |                                          |
| expires_at     | TIMESTAMPTZ   | NOT NULL                                 |
| ip_address     | INET          |                                          |
| user_agent     | TEXT          |                                          |

### `documents`
| Column          | Type        | Constraints                                           |
|-----------------|-------------|-------------------------------------------------------|
| id              | UUID        | PRIMARY KEY, default gen_random_uuid()                |
| session_id      | UUID        | NOT NULL, FK → sessions(id) ON DELETE CASCADE         |
| filename        | TEXT        | NOT NULL                                              |
| mime_type       | TEXT        | NOT NULL                                              |
| file_size_bytes | BIGINT      | NOT NULL                                              |
| s3_key          | TEXT        | UNIQUE NOT NULL (`sessions/{sid}/documents/{did}/original`) |
| status          | TEXT        | NOT NULL DEFAULT 'pending_upload' (materialized from processing_jobs) |
| created_at      | TIMESTAMPTZ | DEFAULT NOW()                                         |
| updated_at      | TIMESTAMPTZ | DEFAULT NOW()                                         |

Index: `(session_id)` — for session-scoped document listing.

### `processing_jobs`
| Column           | Type        | Constraints                                          |
|------------------|-------------|------------------------------------------------------|
| id               | UUID        | PRIMARY KEY, default gen_random_uuid()               |
| document_id      | UUID        | UNIQUE NOT NULL, FK → documents(id) ON DELETE CASCADE |
| session_id       | UUID        | NOT NULL (denormalized for tenant-scoped queries)    |
| status           | TEXT        | NOT NULL DEFAULT 'pending_upload'                    |
| total_chunks     | INTEGER     | NULL until chunking phase completes                  |
| processed_chunks | INTEGER     | NOT NULL DEFAULT 0                                   |
| progress_pct     | SMALLINT    | NOT NULL DEFAULT 0                                   |
| checkpoint_index | INTEGER     | NOT NULL DEFAULT -1 (-1 = not started; N = last completed batch index) |
| worker_id        | TEXT        | Which worker pod processed this job                  |
| error_code       | TEXT        | Machine-readable failure class (e.g. 'invalid_file_type') |
| error_message    | TEXT        | Human-readable error detail                          |
| started_at       | TIMESTAMPTZ |                                                      |
| completed_at     | TIMESTAMPTZ |                                                      |
| created_at       | TIMESTAMPTZ | DEFAULT NOW()                                        |
| updated_at       | TIMESTAMPTZ | DEFAULT NOW()                                        |

Index: `(session_id, status)` — for session-scoped job listing.
Unique: `(document_id)` — one job per document, enforces single processing path.

### `document_chunks`
| Column        | Type          | Constraints                                              |
|---------------|---------------|----------------------------------------------------------|
| id            | UUID          | PRIMARY KEY, default gen_random_uuid()                   |
| document_id   | UUID          | NOT NULL, FK → documents(id) ON DELETE CASCADE           |
| session_id    | UUID          | NOT NULL (denormalized for tenancy-scoped vector search) |
| chunk_index   | INTEGER       | NOT NULL (sequential position within document)           |
| page_number   | INTEGER       | NULL for plain text; page of origin for PDFs             |
| content       | TEXT          | NOT NULL                                                 |
| token_count   | INTEGER       | Approximate token count for the chunk                    |
| embedding     | vector(1024)  | Prisma: `Unsupported("vector(1024)")`                    |
| model_version | TEXT          | NOT NULL DEFAULT 'titan-embed-text-v2' (for future re-indexing) |
| created_at    | TIMESTAMPTZ   | DEFAULT NOW()                                            |
| updated_at    | TIMESTAMPTZ   | DEFAULT NOW()                                            |

**UNIQUE: `(document_id, chunk_index)`** — enables idempotent upsert on retry.
Index: `HNSW (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`.
Index: `(session_id)` — WHERE clause for all tenancy-scoped vector searches.

### `query_logs`
| Column              | Type         | Constraints                                      |
|---------------------|--------------|--------------------------------------------------|
| id                  | UUID         | PRIMARY KEY                                      |
| session_id          | UUID         | NOT NULL, FK → sessions(id) ON DELETE CASCADE    |
| query_text          | TEXT         | NOT NULL                                         |
| query_embedding     | vector(1024) | Prisma: `Unsupported("vector(1024)")`            |
| retrieved_chunk_ids | UUID[]       | Chunk IDs returned by similarity search          |
| answer_text         | TEXT         |                                                  |
| latency_ms          | INTEGER      |                                                  |
| model_version       | TEXT         |                                                  |
| created_at          | TIMESTAMPTZ  | DEFAULT NOW()                                    |

### `audit_log`
| Column     | Type        | Constraints                                                                 |
|------------|-------------|-----------------------------------------------------------------------------|
| id         | UUID        | PRIMARY KEY                                                                 |
| session_id | UUID        |                                                                             |
| event_type | TEXT        | NOT NULL ('document_uploaded', 'query_made', 'session_created', etc.)       |
| entity_id  | UUID        | ID of the relevant document/query/session                                   |
| metadata   | JSONB       |                                                                             |
| created_at | TIMESTAMPTZ | DEFAULT NOW()                                                               |

---

## PG NOTIFY Trigger (append to migration SQL)

After `prisma migrate dev` generates the base migration SQL, append the following trigger
to the migration file before committing. This trigger powers the SSE progress push mechanism:

```sql
CREATE OR REPLACE FUNCTION notify_progress_channel()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'progress_channel',
    json_build_object(
      'document_id',      NEW.document_id,
      'status',           NEW.status,
      'progress_pct',     NEW.progress_pct,
      'processed_chunks', NEW.processed_chunks,
      'total_chunks',     NEW.total_chunks,
      'error_code',       NEW.error_code,
      'error_message',    NEW.error_message
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER processing_jobs_notify
AFTER UPDATE ON processing_jobs
FOR EACH ROW EXECUTE FUNCTION notify_progress_channel();
```

The Express API `LISTEN`s to `progress_channel` and routes NOTIFY payloads to the
matching SSE connection by `document_id`.

---

## Status Enum (Reference — enforced by application layer, not DB enum type)

```
pending_upload  → API created record, presigned URL issued
uploaded        → Browser called confirm-upload after S3 200 OK
downloading     → Worker fetching S3 object
validating      → Worker sniffing magic bytes, checking MIME type
extracting      → Worker parsing text via PyMuPDF
chunking        → Worker splitting into paragraph chunks
embedding       → Worker generating and persisting vectors (with progress %)
completed       → All chunks embedded; document is queryable
failed          → Unrecoverable error (error_code + error_message stored)
cancelled       → User or system cancelled before completion
expired         → Presigned URL TTL elapsed, never uploaded (cleanup job sets this)
```

Terminal states: `completed`, `failed`, `cancelled`, `expired` — no further transitions.

---

## Acceptance Criteria
* Prisma models defined for all six tables above with correct column types.
* `DocumentChunk.embedding` uses `Unsupported("vector(1024)")`.
* `UNIQUE (document_id, chunk_index)` constraint present on `document_chunks`.
* `UNIQUE (document_id)` constraint present on `processing_jobs`.
* Migration SQL includes the HNSW cosine index and the PG NOTIFY trigger.
* Foreign key cascades defined: deleting a session cascades to documents → chunks + jobs.
* No raw SQL schemas hand-written; schema state initialized via `prisma migrate dev`.

## Validation Steps
1. Start local PostgreSQL container with pgvector installed (Docker).
2. Run `npx prisma migrate dev --name init` inside `apps/api`.
3. Verify all tables, foreign keys, UNIQUE constraints, and the HNSW index created.
4. Run `psql -c "SELECT tgname FROM pg_trigger WHERE tgrelid = 'processing_jobs'::regclass;"` and assert `processing_jobs_notify` is present.
5. Manually update a `processing_jobs` row and assert `LISTEN progress_channel` receives a payload.

## Definition Of Done
* `schema.prisma` checked in.
* Local migrations execute with zero warnings.
* PG NOTIFY trigger verified firing on `processing_jobs` update.

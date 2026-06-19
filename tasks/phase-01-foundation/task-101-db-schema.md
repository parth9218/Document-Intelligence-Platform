# Task 101: Database Schema Creation

## Goal
Establish the PostgreSQL database schema including pgvector tables, sessions, logs, and indexing.

## Scope
Write a SQL migration script `apps/api/src/db/init.sql` to initialize the database tables with foreign key cascades and vector columns.

## Files Expected To Change
* `apps/api/src/db/init.sql`

## Dependencies
None

## Acceptance Criteria
* The schema creates tables: `sessions`, `documents`, `document_chunks`, `processing_jobs`, `query_logs`, `audit_log`.
* `document_chunks` includes an `embedding` column defined as type `vector(1024)`.
* An HNSW index is created on the `embedding` column using `vector_cosine_ops` with parameters `m=16`, `ef_construction=64`.
* Cascading deletes are set up from the `sessions` table.

## Validation Steps
1. Start a local PostgreSQL instance with pgvector installed.
2. Run `psql -f apps/api/src/db/init.sql`.
3. Assert that all tables and indexes are created successfully.

## Definition Of Done
* SQL script is checked in.
* Local migrations execute with zero warnings.
* Task marked complete in `docs/progress/implementation-status.md`.

## Follow-Up Tasks
* Task 102: API Session Management

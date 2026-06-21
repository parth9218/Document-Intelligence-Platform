# Task 101: Database Schema Creation via Prisma ORM

## Goal
Establish the PostgreSQL database schema including pgvector tables, sessions, logs, and indexing using Prisma Schema in the TypeScript Express API.

## Scope
Write a Prisma schema `apps/api/prisma/schema.prisma` mapping database tables and types. Generate and apply migrations using Prisma Migrate.

## Files Expected To Change
* `apps/api/prisma/schema.prisma`
* `apps/api/package.json`

## Dependencies
None

## Acceptance Criteria
* Prisma models defined for: `Session`, `Document`, `DocumentChunk`, `ProcessingJob`, `QueryLog`, `AuditLog`.
* `DocumentChunk` model maps the `embedding` vector column using raw/unsupported types or custom vector field attributes (e.g. `Unsupported("vector(1024)")`).
* Migration script generates SQL mapping HNSW cosine similarity index: `CREATE INDEX ON "document_chunks" USING hnsw (embedding vector_cosine_ops);`.
* Define foreign key cascades (e.g. deleting a session automatically cascade-deletes related documents and chunks).
* No raw SQL schemas are hand-written; schema state is initialized purely through `prisma migrate dev`.

## Validation Steps
1. Start a local PostgreSQL instance with pgvector installed (via Docker).
2. Run `npx prisma migrate dev --name init` inside `apps/api`.
3. Verify via database explorer or `psql` that all tables, foreign keys, cascades, and the HNSW index are successfully created.

## Definition Of Done
* `schema.prisma` file is checked in.
* Local migrations execute with zero warnings.

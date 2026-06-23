# Current State Registry

This document records the exact state of code modules and active tasks. Update it after every coding cycle.

## Current Code State
* **API Service (`/apps/api`)**: Initialized. Database schema configured using Prisma ORM. Session management middleware (`sessionMiddleware`) and GET `/api/session` endpoint implemented with HMAC signature verification and 24h sliding expiration.
* **Worker Service (`/apps/worker`)**: Not started (boto3 Python / SQLAlchemy). Directory does not exist yet.
* **Frontend Service (`/apps/frontend`)**: Not started (React SPA). Directory does not exist yet.
* **Infrastructure (`/infra/terraform`)**: Not started. Directory does not exist yet.

## Execution Progress

- **Refined Architecture & Diagrams**: Completed. Specifications added for Retrieval Q&A, SSE streams, PG LISTEN/NOTIFY, and UI progress bars.
- **Ingestion Flow Brainstorm & Pre-Implementation Review**: Completed. Full ingestion pipeline reviewed and corrections applied. See `docs/context/ingestion-flow-decisions.md`.
- **Task Specifications Updated (Phase 1 & 2)**: Completed. Tasks 101, 103, 104, 201, 202, 203 updated with implementation-level detail.
- **Phase 1 (Foundation)**: In Progress. Tasks 101 (Database Schema) and 102 (API Session Management) are complete. Next is Task 103 (Document Upload & Status tracking).
- **Phase 2 (Ingestion)**: Pending.
- **Phase 3 (Query Engine)**: Pending.
- **Phase 4 (Observability)**: Pending.
- **Phase 5 (Platform)**: Pending.

## Operational Warnings

- Ensure local Docker runs pgvector before implementing Task 101.
- Verify local environment variables avoid colliding with AWS profile parameters.
- The PG NOTIFY trigger on `processing_jobs` must be appended to the Prisma-generated migration SQL — it cannot be expressed in `schema.prisma` directly.
- `EMBEDDING_PROVIDER=local` env var switches worker embedding from Bedrock to Sentence-Transformers. Must be set in local `.env` during development.
- SQLAlchemy models in `apps/worker/models.py` must be manually kept in sync with Prisma schema changes. Prisma Migrate is the single source of truth.
- SQS visibility timeout is 600 seconds (10 min). Adjust if processing times exceed this during testing.

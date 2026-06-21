# Current State Registry

This document records the exact state of code modules and active tasks. Update it after every coding cycle.

## Current Code State
* **API Service (`/apps/api`)**: Not started (Express TypeScript / Prisma). Directory does not exist yet.
* **Worker Service (`/apps/worker`)**: Not started (boto3 Python / SQLAlchemy). Directory does not exist yet.
* **Frontend Service (`/apps/frontend`)**: Not started (React SPA). Directory does not exist yet.
* **Infrastructure (`/infra/terraform`)**: Not started. Directory does not exist yet.

## Execution Progress

- **Refined Architecture & Diagrams**: Completed. Specifications added for Retrieval Q&A, SSE streams, PG LISTEN/NOTIFY, and UI progress bars.
- **Phase 1 (Foundation)**: Pending. Target Task 101.
- **Phase 2 (Ingestion)**: Pending.
- **Phase 3 (Query Engine)**: Pending.
- **Phase 4 (Observability)**: Pending.
- **Phase 5 (Platform)**: Pending.

## Operational Warnings

- Ensure local Docker runs pgvector before implementing Task 101.
- Verify local environment variables avoid colliding with AWS profile parameters.
- Make sure that the Postgres trigger configuration for pgvector table supports `NOTIFY` channel broadcasts for real-time progress.

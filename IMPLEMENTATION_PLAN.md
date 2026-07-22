# AI Document Intelligence Platform — Master Roadmap

This document maps out the phased execution plan for the platform, ensuring each phase achieves a distinct milestone with clear deliverables.

---

## Phase 1: Foundation (Database & API Skeleton)
* **Goal**: Setup database schemas (including tracking tables), session mechanisms, upload interfaces, and worker frameworks.
* **Tasks**:
  * **Task 1.1: Database Schema Creation (Task 101)**: Create database tables (`sessions`, `documents`, `document_chunks`, `processing_jobs`, `query_logs`, `audit_log`) using Prisma schema (`schema.prisma`) in `apps/api`. Set up HNSW cosine similarity vector index. Generate and run SQL migrations via `prisma migrate dev`.
  * **Task 1.2: API Session Management (Task 102)**: Implement signed cookie authentication middleware, session persistence, and session tenancy validations in TypeScript Express.
  * **Task 1.3: Document Upload, Confirm-Upload & Status Routes (Task 103)**: Express endpoints for generating S3 presigned POST URLs (with Content-Type and size conditions embedded), confirming upload completion (`POST /api/documents/:id/confirm-upload` — the browser calls this after S3 returns 204 No Content to transition status to `uploaded`), session-wide status polling (`GET /api/documents/status` — returns all session document statuses), and session-wide SSE progress streaming (`GET /api/documents/progress` — emits `snapshot` event on connect, `update` events per PG NOTIFY on session-scoped channel). Includes orphan cleanup job for expired and stuck-uploaded records.
  * **Task 1.4: Worker SQS Consumer Loop (Task 104)**: Setup Python boto3 polling loop with long polling and graceful shutdown handling.
  * **Task 1.5: SSE Architecture Refactor (Task 105)**: Migrate existing per-document SSE and status endpoints to session-scoped equivalents per ADR-017. Includes new Prisma migration to overwrite `notify_progress_channel()` with session-scoped PG NOTIFY channel (`progress_{sessionId}`), remove `GET /api/documents/:id/progress` and `GET /api/documents/:id/status`, and update integration tests.
  * **Task 1.7: Session Auto-Initialization Refactor (Task 107)**: Update `GET /api/session` behavior to automatically generate and return a new session if the session cookie is missing.
* **Milestone**: API returns presigned S3 URLs, validates signed cookies, and returns job statuses. Worker polls SQS safely.
* **Verification**: Integration checks for signed requests, local SQS polling loop execution, and test database schema runs.

---

## Phase 2: Ingestion Pipeline
* **Goal**: Build file downloading, text extraction, paragraph chunking, vector embedding, storage, and progress reporting logic.
* **Tasks**:
  * **Task 2.1: Worker Document Extraction (Task 201)**: Download files, sniff magic numbers to validate type, handle corrupt file states, parse text page-by-page using PyMuPDF, and update status to `downloading` and `extracting`.
  * **Task 2.2: Worker Chunking & Embedding Generation (Task 202)**: Paragraph-based text chunker (~500 tokens, 75-token overlap) and Amazon Bedrock Titan Embeddings V2 integration.
  * **Task 2.3: Worker Vector Storage & Job Progress Updates (Task 203)**: Batch upsert vector embeddings and chunk metadata to Postgres using SQLAlchemy `ON CONFLICT DO UPDATE` (idempotent on `(document_id, chunk_index)`). Incrementally update `processing_jobs` counters (`processed_chunks`, `progress_pct`, `checkpoint_index`) per batch of 50 chunks. On success, atomically mark the document and job as `completed`. Supports checkpoint-based resume from the last persisted batch on worker restart.
* **Milestone**: Raw PDF uploaded to S3 is processed by the worker, updating progress updates dynamically in the database and loading vectors into pgvector.
* **Verification**: Assert `document_chunks` records exist with correct content, page mapping, and active vector data. Assert `processing_jobs` records accurately record progress percentage increments.

---

## Phase 3: Query & Citation Engine
* **Goal**: Chat endpoint matching vector queries, streaming grounded answers, verifying citations, and rendering progress.
* **Tasks**:
  * **Task 3.1: API Similarity Search (Task 301)**: Embed query using configured provider (`EMBEDDING_PROVIDER` — Amazon Bedrock Titan V2 for cloud or local model for offline/local development matching the Python worker), and query pgvector using cosine similarity (`<=>`) with strict session tenancy filter in Express API using Prisma client raw queries.
  * **Task 3.2: API Answer Generation & Citation Verification (Task 302)**: Construct system prompt with retrieved context snippets. Invoke Bedrock Claude with streaming enabled. Scan response for citation brackets (`[1]..[n]`), verify they match retrieved context IDs, and stream verified citation metadata alongside Claude's text tokens via SSE using Express API.
  * **Task 3.3: Frontend Progress & Streaming Integration (Task 303)**: Update React SPA to track file upload progress (browser-side), poll/SSE `/api/documents/:id/status` to show chunking/embedding progress bars, and connect to `/api/query` streaming answer endpoint to render interactive, validated citation bubbles.
* **Milestone**: Full interactive UI where files are uploaded with progress bars, processed, and users query documents to receive streamed answers with citations.
* **Verification**: Verify citation validation discards hallucinated brackets, SSE streams deliver data in chunk frames, and query responses finish in < 2.5s.

---

## Phase 4: Observability Integration
* **Goal**: Standardize telemetry across Express API and Python Worker.
* **Tasks**:
  * **Task 4.1: OpenTelemetry Tracing (Task 401)**: Wire up auto-instrumentation for Express, prisma client, pg, boto3, and Bedrock calls.
  * **Task 4.2: Prometheus & Loki Aggregation (Task 402)**: Standardize metric collection and structured JSON logging.
* **Milestone**: Metrics, traces, and logs are aggregated and queryable in Grafana.
* **Verification**: Verify trace maps connect API requests down through SQS, Worker tasks, Bedrock API calls, and DB transactions.

---

## Phase 5: Cloud Deployment & Platform Hardening
* **Goal**: Terraform provisioning, Helm packaging, ArgoCD GitOps, and KEDA autoscaling.
* **Tasks**:
  * **Task 5.1: Terraform Provisioning (Task 501)**
  * **Task 5.2: Helm Charting (Task 502)**
  * **Task 5.3: ArgoCD GitOps Integration (Task 503)**
  * **Task 5.4: KEDA Autoscaling (Task 504)**
  * **Task 5.5: Security Hardening (NetworkPolicies, Kyverno) (Task 505)**
* **Milestone**: Infrastructure is created from zero via Terraform and deployed automatically via GitOps.
* **Verification**: Verify workers scale from 0 to 10 based on SQS queue depth KEDA metrics.

# Architecture Decision Records (ADR)

This log tracks the rationale, decisions, and tradeoffs for the platform's core infrastructure.

## ADR-001: Node.js API and Python Worker Polyglot split
* **Status**: Approved
* **Context**: We need to handle concurrent streaming SSE query sessions while performing text extraction and embeddings.
* **Decision**: Split backend into a Node.js/TypeScript API (concurrency, fast Web I/O) and a Python Worker (Doc extraction, embeddings API calls).
* **Tradeoffs**: Managing two container build pipelines and separate service lifecycles.

## ADR-002: Custom boto3 SQS Consumer instead of Celery
* **Status**: Approved
* **Context**: In `Analysis2.txt`, Celery on Redis was recommended. However, Celery SQS transport has stability issues.
* **Decision**: Write a custom Python worker polling SQS directly via `boto3`.
* **Rationale**: Simplifies dependencies, uses native AWS-SDK retry behaviors, and removes Celery wrapper complexity.

## ADR-003: React SPA served from S3/CloudFront
* **Status**: Approved
* **Context**: Decoupling the frontend from the Kubernetes cluster.
* **Decision**: Compile the React client into static assets and serve via S3 + CloudFront.
* **Rationale**: Lowers operating cost, scales automatically, and demonstrates cloud-native pattern judgment.

## ADR-004: Amazon Bedrock Titan V2 + Claude
* **Status**: Approved
* **Context**: Avoid sharing API keys for third-party endpoints inside EKS.
* **Decision**: Bind Bedrock foundation models using IAM credentials via IRSA.
* **Rationale**: Aligns directly with AWS-DOP security guidelines.

## ADR-005: PyMuPDF instead of Docling
* **Status**: Approved
* **Context**: Parsing multimodal PDFs requires heavy resources.
* **Decision**: Target text-native PDFs using PyMuPDF (`fitz`) for v1.
* **Rationale**: Reduces container size, improves processing times, and keeps implementation scoped.

## ADR-006: RDS Proxy + IAM DB Authentication
* **Status**: Approved
* **Context**: Secure EKS connections to PostgreSQL.
* **Decision**: Connect using IAM DB authentication tokens through an RDS Proxy.
* **Rationale**: Removes password storage in K8s, handles high pod scaling without connection exhaustion.

## ADR-007: Local Testing Mock Environment (Localstack, Local pgvector, Local LLMs)
* **Status**: Approved
* **Context**: Avoid expensive cloud billing and API latency during local testing, development, and CI phases.
* **Decision**: Implement `Localstack` to mock AWS S3/SQS, use a local containerized PostgreSQL database with the `pgvector` extension for 100% vector store parity, and integrate `Ollama`/local offline embeddings for text generation/embeddings locally.
* **Rationale**: Decouples local execution from AWS API keys/bills, guarantees 100% SQL and indexing parity with production, and permits developer workflows to execute entirely offline.

## ADR-008: Ingestion Progress Updates via SSE and PG LISTEN/NOTIFY
* **Status**: Approved
* **Context**: The frontend needs to update the user on the progress of document ingestion (downloading, extracting, chunking, embedding) in real-time.
* **Decision**: Implement a hybrid push/pull progress communication system:
  1. **Primary Push**: Node.js Express API streams status updates to React SPA using Server-Sent Events (SSE) via `/api/documents/:id/progress`. The API listens to updates from the database using PostgreSQL `LISTEN/NOTIFY` on updates to the `processing_jobs` table.
  2. **Fallback Pull**: React SPA polls `GET /api/documents/:id/status` every 3 seconds if the SSE connection fails to establish or disconnects.
* **Rationale**: This provides efficient, near-instantaneous status propagation to the client with minimal connection/server overhead, avoiding the operational complexity of full WebSockets while maintaining a robust polling fallback.

## ADR-009: Polyglot ORM Strategy (Prisma for Node.js API, SQLAlchemy for Python Worker)
* **Status**: Approved
* **Context**: To scale the API efficiently while keeping backend components decoupled, we run an Express/TS API and a Python worker. Both services access the same PostgreSQL database. We must avoid raw SQL queries in both services to prevent injections and maintain models.
* **Decision**: Adopt a dual ORM architecture mapping to the same underlying database schema:
  1. **Node.js Express API**: Use **Prisma ORM** as the database access layer. Prisma manages database migrations using **Prisma Migrate** as the single source of truth for the database schema.
  2. **Python Worker Daemon**: Use **SQLAlchemy (Declarative)** to map database operations inside the Python worker, writing Python classes that mirror the Prisma-generated database tables exactly.
* **Rationale**: This leverages the best-in-class ORM for each runtime (Prisma's excellent auto-generated client typing for Express, and SQLAlchemy's robust database session management and custom vector mappings for Python). Database schema state is unified by executing all migrations solely through Prisma Migrate schema files.

## ADR-010: Confirm-Upload Endpoint for Upload Status Transition
* **Status**: Approved
* **Context**: Files are uploaded directly from the browser to S3 via presigned URLs. The backend receives no signal from this transfer. The S3 ObjectCreated → SQS event triggers the worker's processing, not the `uploaded` status transition. Without an explicit confirmation step, the frontend has no mechanism to show "Upload Complete" until the worker begins downloading.
* **Decision**: Implement `POST /api/documents/:id/confirm-upload` as the sole mechanism to transition `processing_jobs.status` from `pending_upload` to `uploaded`. The browser calls this endpoint immediately after receiving `200 OK` from S3.
* **Rationale**: Decouples the "upload completed" UX signal from the asynchronous SQS delivery. Keeps the state machine coherent: `uploaded` means the file is in S3 and the browser confirmed it; `downloading` means the worker has begun acting on the SQS event.

## ADR-011: Hybrid Batch-Level Progress Tracking
* **Status**: Approved
* **Context**: Progress tracking for the embedding stage requires a balance between update granularity and write amplification. Per-chunk writes produce unacceptable DB load (5,000 writes for a 5,000-chunk document). Phase-level tracking only (processing/embedding/done) is too coarse for user experience.
* **Decision**: Track progress using aggregate counters on `processing_jobs`: `total_chunks` (set after chunking), `processed_chunks` (incremented per batch), `progress_pct` (computed linear percentage). Update these counters once per batch of 50 chunks. The PG NOTIFY trigger fires on each update, delivering one SSE frame per batch to the browser.
* **Rationale**: A 5,000-chunk document at batch size 50 produces 100 DB writes and 100 SSE events — acceptable write amplification. Progress display remains granular enough for user transparency. `progress_pct` is capped at 99 until the final completion transaction to avoid premature 100% display.

## ADR-012: Idempotency Strategy for Worker Processing
* **Status**: Approved
* **Context**: SQS delivers messages at least once. Workers can crash mid-batch. Document processing must be safe to retry from any point without duplicating chunks, re-embedding completed batches, or corrupting job state.
* **Decision**: Three-mechanism idempotency strategy:
  1. **Upsert key**: `UNIQUE (document_id, chunk_index)` constraint on `document_chunks` enables `INSERT ... ON CONFLICT DO UPDATE` — any batch can be re-run safely.
  2. **Checkpoint resume**: `checkpoint_index` on `processing_jobs` records the last successfully persisted batch index. On restart, the worker reads `checkpoint_index + 1` and skips completed batches.
  3. **Re-indexing support**: `model_version` column on `document_chunks` enables future targeted re-embedding (e.g., on model upgrade) without full document reprocessing.
* **Rationale**: Provides exactly-once logical processing semantics at the batch level without requiring distributed locks or external coordination. SQS visibility timeout (600s) acts as the distributed lock preventing concurrent workers from processing the same document.

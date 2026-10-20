# Python Ingestion Worker

<p align="center">
  <strong>Decoupled background processing daemon polling Amazon SQS, extracting document text, executing sliding-window paragraph chunking, generating vector embeddings, and committing vectors into PostgreSQL with idempotent checkpoint resumption.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+" />
  <img src="https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white" alt="SQLAlchemy 2.0" />
  <img src="https://img.shields.io/badge/boto3-AWS_SDK-FF9900?style=flat-square&logo=amazonwebservices&logoColor=white" alt="boto3" />
  <img src="https://img.shields.io/badge/PyMuPDF-fitz-5272B4?style=flat-square&logo=mupdf&logoColor=white" alt="PyMuPDF" />
  <img src="https://img.shields.io/badge/pgvector-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/KEDA-0→10_Autoscaling-FF6600?style=flat-square&logo=kubernetes&logoColor=white" alt="KEDA" />
</p>

<p align="center">
  <a href="#overview">Overview</a> &bull;
  <a href="#core-technologies--dependencies">Dependencies</a> &bull;
  <a href="#architecture--pipeline-flow">Architecture</a> &bull;
  <a href="#idempotency--checkpoint-resume">Idempotency</a> &bull;
  <a href="#plugin-based-provider-strategy">Plugin Providers</a> &bull;
  <a href="#local-development">Local Setup</a> &bull;
  <a href="#docker-containerization">Docker Build</a> &bull;
  <a href="https://parth9218.github.io/Document-Intelligence-Platform/">📖 Full Documentation</a>
</p>

---

## Overview

The **Python Ingestion Worker** is an asynchronous daemon engineered to handle compute-intensive document transformation tasks off the critical path of client HTTP requests. Scaling from **0 to 10 pods** via KEDA based on Amazon SQS queue depth, worker pods consume S3 `ObjectCreated` event notifications, download source files, validate binary signatures, and extract layout-aware page text.

Extracted text is tokenized into sliding-window paragraph chunks, embedded into 1024-dimensional vector space using Amazon Bedrock Titan Embeddings V2 (or local Sentence-Transformers), and stored in PostgreSQL using pgvector. State updates are incrementally persisted per 50-chunk batch, triggering PostgreSQL `LISTEN/NOTIFY` updates back to active client SSE sessions.

---

## Core Technologies & Dependencies

| Dependency                    | Purpose                     | Production Implementation                                                                                 |
| :---------------------------- | :-------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `boto3`                       | AWS SDK for Python          | Native SQS long-polling (`WaitTimeSeconds=20`), S3 streaming download, and Bedrock Runtime invocation     |
| `SQLAlchemy` (v2.0)           | Relational Database ORM     | Maps database entities (`documents`, `processing_jobs`, `document_chunks`) in lockstep with Prisma schema |
| `pgvector`                    | Vector similarity extension | Provides native `Vector(1024)` column types for storing high-dimensional embeddings                       |
| `psycopg` / `psycopg2-binary` | PostgreSQL database drivers | Database connectivity supporting IAM authentication tokens and SSL certificates                           |
| `PyMuPDF` (`fitz`)            | High-speed PDF parsing      | Extracts page-by-page text layout natively without heavy OCR or headless browser overhead                 |
| `sentence-transformers`       | Offline local embeddings    | Local inference using `intfloat/e5-large-v2` (configured via `requirements-local.txt`)                    |
| `python-dotenv`               | Configuration management    | Loads local `.env` settings into strongly-typed `Settings` class                                          |

---

## Architecture & Pipeline Flow

The worker runs a multi-threaded daemon model consisting of a primary blocking SQS consumer loop and a secondary asynchronous Dead Letter Queue (DLQ) observer thread:

```mermaid
flowchart TD
    SQS["Amazon SQS Ingestion Queue"] -->|20s Long Poll| Consumer["SQS Consumer Loop (boto3)"]
    Consumer --> JobHandler["Job Handler"]

    JobHandler -->|1. Download Raw Document| S3["Amazon S3 Storage"]
    S3 --> Extractor["Extractor Service (PyMuPDF)"]
    Extractor -->|2. Extract Page Text| Chunker["Sliding Window Chunker (500 Tokens)"]
    Chunker -->|3. Generate Embeddings| Embedder["Embeddings Provider (Titan V2 / E5)"]
    Embedder -->|4. Batch Upsert 50 Chunks| Repo["Job Repository (SQLAlchemy)"]

    Repo -->|Persist Vectors and Update Progress| DB[("Amazon RDS PostgreSQL with pgvector")]
    JobHandler -->|5. Atomically Mark Completed| DB
    Consumer -->|6. Delete Acknowledged Message on Completion| SQS

    DLQ["Amazon SQS Dead Letter Queue"] -->|Poll Every 30s| DLQPoller["DLQ Poller Daemon Thread"]
    DLQPoller -->|Mark Status Failed after 3 Retries| DB
```

### Ingestion Lifecycle States

During execution, the worker transitions the database record in `processing_jobs` across distinct granular lifecycle checkpoints:

```text
[pending_upload] ──(Browser confirms upload)──> [uploaded]
   └── (Worker receives SQS message)──> [downloading]
   └── (Magic byte & UTF-8 checks)───> [validating]
   └── (PyMuPDF page-by-page text)───> [extracting]
   └── (Sliding-window tokenization)─> [chunking]
   └── (Batch embedding & upsert)────> [embedding]
   └── (All batches committed)───────> [completed]
```

---

## Idempotency & Checkpoint Resume

Because Amazon SQS guarantees **at-least-once delivery**, workers are architected to withstand transient network failures, pod terminations, and retries without corrupting data or duplicating embeddings:

1. **Upsert Composite Key**: The `document_chunks` table enforces a `UNIQUE (document_id, chunk_index)` constraint. Embeddings are persisted using PostgreSQL `INSERT ... ON CONFLICT (document_id, chunk_index) DO UPDATE`, ensuring safe retries.
2. **Batch Checkpoint Resumption**: The worker commits database transactions in batches of **50 chunks**. After each batch is persisted, the worker increments `processed_chunks` and updates `checkpoint_index = batch_number` in `processing_jobs`. If a worker crashes on batch 7, the replacement pod skips batches 0–6 and resumes processing from batch 7 (`checkpoint_index + 1`).
3. **Graceful Signal Handling & Visibility Expiration**: On receiving `SIGTERM` or `SIGINT` (e.g., during KEDA scale-down or node rolling updates), the worker sets a cooperative `shutdown_requested` flag, preventing the consumer from accepting new SQS messages. The active SQS message is acknowledged and deleted **strictly after the entire document workflow completes**. If a pod is terminated mid-document, the message is left unacknowledged; once its SQS visibility timeout expires, the message returns to the queue for a replacement pod to resume from the latest recorded `checkpoint_index`.
4. **DLQ Observer**: If a poison-pill payload exceeds 3 receive attempts, SQS routes the message to the DLQ. A secondary background poller detects the abandoned job and transitions `processing_jobs.status` to `failed` with error code `max_retries_exceeded`.

---

## Plugin-Based Provider Strategy

The worker adopts an abstract strategy pattern for vector embedding generation (`EmbeddingProvider`), allowing runtime decoupling between cloud infrastructure and local development:

```mermaid
classDiagram
    class EmbeddingProvider {
        <<abstract>>
        +embed_chunk(text)* List~float~
        +embed_batch(texts)* List~List~float~~
    }
    class BedrockEmbeddingProvider {
        +embed_chunk(text) List~float~
        +embed_batch(texts) List~List~float~~
    }
    class LocalEmbeddingProvider {
        +embed_chunk(text) List~float~
        +embed_batch(texts) List~List~float~~
    }
    EmbeddingProvider <|-- BedrockEmbeddingProvider
    EmbeddingProvider <|-- LocalEmbeddingProvider
```

- **`BedrockEmbeddingProvider` (`EMBEDDING_PROVIDER=bedrock`)**:
  - Utilizes `boto3` Bedrock Runtime client calling `amazon.titan-embed-text-v2:0`.
  - Generates 1024-dimensional normalized float vectors with exponential backoff retries on `ThrottlingException`.
- **`LocalEmbeddingProvider` (`EMBEDDING_PROVIDER=local`)**:
  - Loads `sentence-transformers` using `intfloat/e5-large-v2` locally on CPU.
  - **Asymmetric Prefix Rule**: Prepend `passage: ` to every document chunk text before encoding, ensuring strict alignment with the query engine's `query: ` prefix.

---

## Local Development

### Prerequisites

- **Python**: `3.11` or higher
- **PostgreSQL + pgvector**: Running locally on `localhost:5432` with schema migrations applied from `apps/api`
- **LocalStack**: Emulating S3 (`documents-bucket`) and SQS (`document-ingestion-queue`) on `http://localhost:4566`

### Setup Instructions

1. **Create and Activate a Virtual Environment**:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. **Configure Environment Variables**:

   ```bash
   cp .env.example .env
   ```

3. **Install Dependencies**:

   ```bash
   # Install standard requirements + local sentence-transformers
   pip install -r requirements-local.txt
   ```

4. **Run Background Worker Daemon**:
   ```bash
   python main.py
   ```
   The daemon connects to the local SQS queue, logs queue health, spawns the DLQ observer, and blocks on incoming messages.

### Key Environment Variables

| Variable               | Default (Local)                                          | Purpose                                                 |
| :--------------------- | :------------------------------------------------------- | :------------------------------------------------------ |
| `DATABASE_URL`         | `postgresql://postgres:postgres@localhost:5432/docintel` | PostgreSQL connection string                            |
| `DB_IAM_AUTH_ENABLED`  | `false`                                                  | Enable IAM database connection token generation for RDS |
| `AWS_REGION`           | `us-east-1`                                              | AWS Region for AWS SDK calls                            |
| `LOCALSTACK_URL`       | `http://localhost:4566`                                  | LocalStack mock endpoint (empty in cloud environments)  |
| `QUEUE_URL`            | `http://localhost:4566/.../document-ingestion-queue`     | Target SQS queue URL for incoming jobs                  |
| `DLQ_URL`              | `http://localhost:4566/.../document-ingestion-queue-dlq` | Dead Letter Queue URL for poison-pill detection         |
| `S3_BUCKET`            | `documents-bucket`                                       | S3 bucket containing uploaded raw files                 |
| `EMBEDDING_PROVIDER`   | `local`                                                  | Embedding provider (`local` or `bedrock`)               |
| `EMBEDDING_MODEL`      | `intfloat/e5-large-v2`                                   | Model identifier for embeddings generation              |
| `EMBEDDING_DIMENSIONS` | `1024`                                                   | Vector dimension size matching database schema          |
| `DEBUG_LOG`            | `false`                                                  | Enable verbose debug logging                            |

---

## Docker Containerization

The Worker image is packaged using a minimal, non-root **two-stage Docker build** based on `python:3-slim`:

```mermaid
flowchart LR
    subgraph Builder_Stage ["Stage 1: builder"]
        B1["python:3-slim"] --> B2["apt-get install wget ca-certificates"]
        B2 --> B3["Download RDS global CA bundle (global-bundle.pem)"]
    end

    subgraph Runner_Stage ["Stage 2: runner"]
        R1["python:3-slim"] --> R2["Create non-root user (appuser:appgroup, UID 1001)"]
        R2 --> R3["pip install --no-cache-dir -r requirements.txt"]
        R3 --> R4["Copy application source code (app/, main.py)"]
        R4 --> R5["Copy global-bundle.pem from builder"]
        R5 --> R6["chown -R appuser:appgroup /app"]
        R6 --> R7["USER 1001"]
        R7 --> R8["CMD ['python', 'main.py']"]
    end

    B3 -->|Copy CA bundle| R5
```

```bash
# Build worker container locally
docker build -t docintel-worker:latest .

# Run container locally with environment file
docker run --rm --env-file .env docintel-worker:latest
```

---

## Key Scripts & Testing

| Command                             | Description                                                              |
| :---------------------------------- | :----------------------------------------------------------------------- |
| `python main.py`                    | Starts the worker daemon (blocking SQS consumer + background DLQ thread) |
| `python -m unittest discover tests` | Executes all unit and integration test suites                            |
| `pytest tests/test_chunker.py`      | Tests paragraph-based sliding window chunking algorithm                  |
| `pytest tests/test_embeddings.py`   | Tests Bedrock and local embedding provider implementations               |
| `pytest tests/test_integration.py`  | Tests full end-to-end ingestion pipeline against LocalStack & pgvector   |

---

## Documentation Links

- [Worker Architecture & Component Overview](https://parth9218.github.io/Document-Intelligence-Platform/services/worker/overview/)
- [SQS Consumer Loop & Visibility Mechanics](https://parth9218.github.io/Document-Intelligence-Platform/services/worker/sqs-consumer/)
- [Document Extraction & Magic Byte Sniffing](https://parth9218.github.io/Document-Intelligence-Platform/services/worker/extraction-pipeline/)
- [Paragraph Chunking & Titan Embeddings](https://parth9218.github.io/Document-Intelligence-Platform/services/worker/chunking-embedding/)
- [Idempotent Vector Storage & Checkpoint Resume](https://parth9218.github.io/Document-Intelligence-Platform/services/worker/idempotency-resume/)
- [KEDA Autoscaling (0→10) on SQS Depth](https://parth9218.github.io/Document-Intelligence-Platform/infrastructure/kubernetes/keda-autoscaling/)

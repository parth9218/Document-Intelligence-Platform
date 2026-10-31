---
title: "Worker Service Standalone Guide"
description: "Local development setup, schema reflection, SQS message consumption, and automated testing for the Python worker daemon."
---

# Worker Service Standalone Guide

> Comprehensive operational runbook for running, configuring, mirroring schemas, and verifying the decoupled Python Ingestion Worker daemon.

---

## Prerequisites & Environment Setup

Before running the worker independently, ensure the following dependencies are available:

- **Python**: Version 3.11 or higher.
- **Virtual Environment Tool**: Standard library `venv`.
- **PostgreSQL**: Version 16 with the `pgvector` extension running (via Docker or local instance).
- **LocalStack**: Emulating S3 and SQS endpoints on port 4566.

---

## Virtual Environment & Dependency Installation

The worker maintains two dependency sets: core production dependencies and extended local development dependencies:

1. **Create and Activate Virtual Environment**:
    - Creation: `python3 -m venv venv`
    - Activation: `source venv/bin/activate`
2. **Install Local Development Dependencies**:
    - Install from `requirements-local.txt`, which includes `requirements.txt` plus local embedding tools (`sentence-transformers`) and schema reflection tools (`sqlacodegen`):
    - Command: `pip install -r requirements-local.txt`

---

## Environment Configuration

Configure the worker by copying `.env.example` to `.env` inside `apps/worker/`:

| Configuration Key | Local Default | Production Invariant | Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://...` | Dynamic via IAM | PostgreSQL connection string |
| `DB_IAM_AUTH_ENABLED` | `false` | `true` | Toggles RDS IAM token auth vs password |
| `AWS_REGION` | `us-east-1` | AWS Region | Active AWS region for S3 and SQS |
| `LOCALSTACK_URL` | `http://localhost:4566` | Unset / Empty | Endpoint override for LocalStack emulation |
| `QUEUE_URL` | `http://localhost:4566/...` | AWS SQS URL | SQS main document ingestion queue URL |
| `DLQ_URL` | `http://localhost:4566/...` | AWS DLQ URL | SQS Dead Letter Queue URL |
| `S3_BUCKET` | `documents-bucket` | S3 bucket name | Source bucket containing uploaded documents |
| `EMBEDDING_PROVIDER` | `local` | `bedrock` | Provider selection (`local` or `bedrock`) |
| `PYTHON_ENV` | `development` | `production` | Operational environment flag |

---

## Unidirectional Schema Reflection (`generate_models.py`)

Under the **Zero Raw SQL Mandate**, Prisma maintains schema authority while the Python worker strictly mirrors the database via SQLAlchemy Declarative models:

- **Model Synchronization Script**: `python scripts/generate_models.py`
- **Execution Mechanism**:
    - Reads `DATABASE_URL` from `apps/worker/.env`.
    - Invokes `sqlacodegen` to inspect the live PostgreSQL database.
    - Emits updated declarative models to `app/models/generated_models.py`.
    - Automatically injects the `pgvector.sqlalchemy.Vector(1024)` type mapping.

---

## Embedding Provider Configuration

The worker supports both offline CPU embedding and AWS Bedrock Titan V2:

| Provider Mode | Setting | Model Reference | Behavioral Characteristics |
| :--- | :--- | :--- | :--- |
| **Local CPU Mode** | `EMBEDDING_PROVIDER=local` | `intfloat/e5-large-v2` | Uses `sentence-transformers`; automatically prepends the asymmetric `passage: ` prefix to indexed passages. |
| **Bedrock Cloud Mode** | `EMBEDDING_PROVIDER=bedrock` | `amazon.titan-embed-text-v2:0` | Invokes Bedrock API via `boto3`; outputs 1,024-dimensional normalized embeddings. |

---

## Worker Execution & Checkpoint Resumption

### Starting the Consumer Daemon
Run the consumer daemon directly from the activated virtual environment:

- Command: `python main.py`
- Initiates 20-second long-polling against the configured SQS queue.

### Operational Resiliency & Checkpoint Recovery

- **Visibility Timeout Guard**: Messages are processed with an SQS visibility timeout of 600s and deleted strictly upon complete job finalization.
- **Batch Checkpoints**: Embeddings are committed to PostgreSQL every 50 chunks alongside updated `checkpoint_index` and `progress_pct`.
- **Fault Recovery**: If a worker process halts or crashes mid-document, the SQS message visibility expires, allowing redelivery to resume seamlessly from `checkpoint_index + 1`.
- **Cooperative Signal Handling**: Trapping `SIGINT` or `SIGTERM` stops new message polling while allowing the active document batch to complete safely.

---

## Automated Testing

Run the automated pytest test suite to verify extraction, chunking, and database persistence:

- Command: `pytest`
- Executes unit tests across:
    - Text extraction (`test_extractor.py`)
    - Sliding-window chunker (`test_chunker.py`)
    - Embedding providers (`test_embeddings.py`)
    - Database upserts and checkpoint updates (`test_storage.py`)
    - End-to-end integration flows against containerized database (`test_integration.py`)

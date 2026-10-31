---
title: "Environment Variables Reference"
description: "Master reference catalog of all environment variables across API, Worker, Frontend, and Local Infrastructure layers."
---

# Environment Variables Reference

> Master authoritative reference matrix for all configuration parameters, secret injection keys, and runtime toggles across every layer of the platform.

---

## 1. Local Infrastructure & Docker Compose (`.env`)

These variables govern local container orchestration in `docker-compose.yml` and `scripts/start-local.sh`:

| Variable Name | Type | Local Default | Description |
| :--- | :--- | :--- | :--- |
| `POSTGRES_DB` | String | `docintel` | Name of the primary PostgreSQL database |
| `POSTGRES_USER` | String | `postgres` | Superuser username for local database container |
| `POSTGRES_PASSWORD` | String | `postgres` | Superuser password for local database container |
| `DB_PORT` | Integer | `5432` | Exposed host port for PostgreSQL |
| `SERVICES` | Comma-delimited | `s3,sqs` | Comma-separated list of AWS services to emulate in LocalStack |
| `AWS_DEFAULT_REGION` | String | `us-east-1` | Default AWS region for LocalStack and local AWS SDK clients |
| `LOCALSTACK_AUTH_TOKEN`| String | `localstack_auth_key` | Optional authentication token for LocalStack Pro features |
| `LOCALSTACK_PORT` | Integer | `4566` | Exposed host port for the LocalStack edge emulator |
| `S3_BUCKET_NAME` | String | `documents-bucket` | S3 bucket created automatically by `init-aws.sh` |
| `QUEUE_NAME` | String | `document-ingestion-queue` | SQS main queue created automatically by `init-aws.sh` |
| `DLQ_NAME` | String | `document-ingestion-queue-dlq` | SQS Dead Letter Queue created with redrive policy |
| `OLLAMA_PORT` | Integer | `11434` | Exposed host port for the Ollama local LLM engine |
| `OLLAMA_MODEL` | String | `llama3.2` | Model pulled automatically by `entrypoint.sh` |

---

## 2. Express API Service (`apps/api/.env`)

These variables configure the Node.js/TypeScript REST API gateway, authentication, and vector retrieval engine:

| Variable Name | Type | Local Default | Production Target | Description |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | Integer | `3000` | Injected via Helm | HTTP listener port for Express |
| `NODE_ENV` | String | `local` | `production` | Node environment runtime mode (`production`, `development`, `local`, `test`) |
| `DATABASE_URL` | URI | `postgresql://...` | IAM DB Token URL | Full PostgreSQL connection URI with pgvector schema |
| `DB_IAM_AUTH_ENABLED` | Boolean | `false` | `true` | When `true`, generates ephemeral 15-minute RDS IAM authentication tokens |
| `DB_HOST` | String | `localhost` | RDS Endpoint | Hostname for the PostgreSQL database instance |
| `DB_PORT` | Integer | `5432` | `5432` | Database network port |
| `DB_NAME` | String | `docintel` | `docintel` | Target database catalog name |
| `DB_USER` | String | `postgres` | IAM DB Role / User | Database username |
| `DB_SSL` | Boolean | `false` | `true` | Enforces TLS encryption for database network connections |
| `SESSION_SECRET` | String | Dev Secret String | AWS Secrets Manager | Cryptographic secret for signing session HMAC cookie tokens |
| `AWS_REGION` | String | `us-east-1` | AWS Region | Active AWS region for Bedrock and S3 SDK clients |
| `AWS_ACCESS_KEY_ID` | String | `mock-key` | IAM Pod Identity | Access key ID (used only in local development) |
| `AWS_SECRET_ACCESS_KEY`| String | `mock-secret` | IAM Pod Identity | Secret access key (used only in local development) |
| `S3_BUCKET` | String | `documents-bucket` | S3 Bucket Name | Destination bucket for presigned POST upload policies |
| `LOCALSTACK_URL` | URI | `http://localhost:4566`| Unset / Empty | When defined, overrides AWS endpoints to point to LocalStack |
| `CORS_ALLOWED_ORIGIN` | URI | `http://localhost:3001`| CloudFront / Custom | Allowed frontend origin for CORS browser enforcement |
| `EMBEDDING_PROVIDER` | Enum | `local` | `bedrock` | Embedding strategy provider (`local` or `bedrock`) |
| `EMBEDDING_MODEL` | String | `Xenova/e5-large-v2` | `amazon.titan-embed-text-v2:0` | Active embedding model identifier |
| `LLM_PROVIDER` | Enum | `local` | `bedrock` | LLM generation strategy provider (`local` or `bedrock`) |
| `LLM_MODEL` | String | `llama3.2` | `anthropic.claude-3-haiku...` | Active LLM model identifier |
| `LLM_ENDPOINT` | URI | `http://localhost:11434`| Unset (AWS Bedrock) | HTTP endpoint for local Ollama completion engine |
| `LLM_MAX_TOKENS` | Integer | `1024` | `1024` | Maximum tokens generated per RAG completion stream |

---

## 3. Python Ingestion Worker (`apps/worker/.env`)

These variables configure the Python daemon for SQS long-polling, S3 streaming, PyMuPDF extraction, and vector upserts:

| Variable Name | Type | Local Default | Production Target | Description |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | URI | `postgresql://...` | IAM DB Token URL | PostgreSQL connection string for SQLAlchemy engine |
| `DB_IAM_AUTH_ENABLED` | Boolean | `false` | `true` | Enables RDS IAM token generation via connect hooks |
| `DB_HOST` | String | `localhost` | RDS Endpoint | Hostname of the target database |
| `DB_PORT` | Integer | `5432` | `5432` | Target database network port |
| `DB_USER` | String | `postgres` | IAM DB Role / User | Database username |
| `DB_SSL` | Boolean | `false` | `true` | Enforces SSL for database connection pool |
| `DB_SSL_ROOT_CERT` | File Path | Unset | `/app/global-bundle.pem` | Path to AWS RDS CA certificate bundle |
| `AWS_REGION` | String | `us-east-1` | AWS Region | Active AWS region for boto3 clients |
| `LOCALSTACK_URL` | URI | `http://localhost:4566`| Unset / Empty | Endpoint override redirecting S3 and SQS to LocalStack |
| `QUEUE_URL` | URI | `http://localhost:4566/...` | AWS SQS Queue URL | SQS queue URL polled for incoming ingestion jobs |
| `DLQ_URL` | URI | `http://localhost:4566/...` | AWS DLQ URL | Dead Letter Queue URL monitored by secondary thread |
| `S3_BUCKET` | String | `documents-bucket` | S3 Bucket Name | S3 bucket containing raw uploaded documents |
| `EMBEDDING_PROVIDER` | Enum | `local` | `bedrock` | Embedding strategy selection (`local` or `bedrock`) |
| `PYTHON_ENV` | String | `development` | `production` | Operational environment mode |

---

## 4. Frontend Client (`apps/frontend/.env.*` & `config.js`)

These variables govern client-side routing modes and API endpoints:

| Variable Name | Runtime Scope | Local Default | Production Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Build / Local | `http://localhost:3000` | Empty (`""`) | Base URL for API requests. In production, relative path `/api` is used. |
| `NEXT_PUBLIC_API_MODE` | Build / Local | `hybrid` | `api` | Active routing mode (`api`, `mock`, or `hybrid`) |
| `window.__APP_CONFIG__.API_URL` | Browser Global | Empty | Injected on S3 | Dynamic runtime override for API URL in `public/config.js` |
| `window.__APP_CONFIG__.API_MODE` | Browser Global | `hybrid` | `api` | Dynamic runtime override for mock/live mode in `public/config.js` |
| `window.__APP_CONFIG__.APP_VERSION`| Browser Global | `0.0.0` | Commit SHA / Tag | Pinned build version metadata displayed in UI |

---

## Security & Production Invariants

1. **Zero Committed Secrets**:
    - `.env` files are strictly excluded via `.gitignore`.
    - Production pods never mount static database passwords; they utilize IAM Database Authentication tokens with a 15-minute time-to-live.
2. **Secrets Store CSI Driver Mounts**:
    - Sensitive production values (e.g., `SESSION_SECRET`) are stored in AWS Secrets Manager and mounted as in-memory `tmpfs` files at `/mnt/secrets/` inside pods.
3. **Decoupled Frontend Builds**:
    - The static frontend bundle contains zero embedded cloud credentials or environment-specific URLs, preserving artifact immutability across promotions.

---
title: "Local Development Environment"
description: "Orchestrating the complete multi-service platform locally using Docker Compose, LocalStack, and containerized pgvector."
---

# Local Development Environment

> Complete local orchestration runbook for running all decoupled platform services, local cloud emulation containers, and background log sinks with zero cloud billing.

---

## Core Emulation Components

The local stack provides complete cloud parity without external AWS connectivity via three Docker containers defined in `docker-compose.yml`:

| Service | Container Image | Port | Emulated Functionality |
| :--- | :--- | :--- | :--- |
| **Relational & Vector DB** | `pgvector/pgvector:pg16` | `5432` | Relational persistence, `LISTEN/NOTIFY` channels, and HNSW cosine similarity search |
| **AWS Cloud Emulation** | `localstack/localstack:latest` | `4566` | S3 direct multipart uploads, SQS document queue, DLQ redrive, and S3 event notifications |
| **Local LLM Engine** | `ollama/ollama:latest` | `11434` | Offline token generation and conversational answers via `llama3.2` |

---

## Automated Orchestration Lifecycle (`start-local.sh`)

The root orchestration script (`scripts/start-local.sh`) automates the full multi-tier startup sequence in a single terminal session:

### Execution Steps Breakdown

1. **Environment Initialization**:
    - Checks for root `.env`; automatically provisions from `.env.example` if absent.
    - Exports all variables to child process environments.
2. **Container Launch & Health Polling**:
    - Starts PostgreSQL, LocalStack, and Ollama in detached mode.
    - Polls container health check endpoints until all services report healthy status.
3. **LocalStack Resource Bootstrapping**:
    - Automatically executes `scripts/localstack/init-aws.sh` upon LocalStack startup.
    - Provisions the `documents-bucket` with open CORS permissions (`GET`, `PUT`, `POST`, `DELETE`, `HEAD`).
    - Creates `document-ingestion-queue-dlq` and `document-ingestion-queue` with a 600-second visibility timeout and a max receive count of 3.
    - Binds an S3 `s3:ObjectCreated:*` event notification to the SQS queue ARN.
4. **Ollama Model Initialization**:
    - Executes `scripts/ollama/entrypoint.sh` inside the Ollama container.
    - Waits for the local Ollama API to respond, then pulls the `llama3.2` model if not cached.
5. **Database Schema Push**:
    - Runs `npx prisma generate` and `npx prisma db push` inside `apps/api` to sync schemas and ensure vector extensions are registered.
6. **Worker Environment Setup**:
    - Verifies the Python virtual environment at `apps/worker/venv`.
    - Automatically initializes the venv and upgrades dependencies from `requirements.txt` if uninstalled.
7. **Process Launch & Log Redirection**:
    - Launches Express API (`npm run dev` on port 3000).
    - Launches Python Worker daemon (`main.py`).
    - Launches Next.js Frontend (`npm run dev:local` on port 3001).
    - Automatically executes `scripts/localstack/init-aws.sh` upon LocalStack startup.
    - Provisions the `documents-bucket` with open CORS permissions (`GET`, `PUT`, `POST`, `DELETE`, `HEAD`).
    - Creates `document-ingestion-queue-dlq` and `document-ingestion-queue` with a 600-second visibility timeout and a max receive count of 3.
    - Binds an S3 `s3:ObjectCreated:*` event notification to the SQS queue ARN.
4. **Ollama Model Initialization**:
    - Executes `scripts/ollama/entrypoint.sh` inside the Ollama container.
    - Waits for the local Ollama API to respond, then pulls the `llama3.2` model if not cached.
5. **Database Schema Push**:
    - Runs `npx prisma generate` and `npx prisma db push` inside `apps/api` to sync schemas and ensure vector extensions are registered.
6. **Worker Environment Setup**:
    - Verifies the Python virtual environment at `apps/worker/venv`.
    - Automatically initializes the venv and upgrades dependencies from `requirements.txt` if uninstalled.
7. **Process Launch & Log Redirection**:
    - Launches Express API (`npm run dev` on port 3000).
    - Launches Python Worker daemon (`main.py`).
    - Launches Next.js Frontend (`npm run dev:local` on port 3001).

---

## Log Management & Inspection

All process logs are redirected to timestamped log sinks to keep terminal output clean and auditable:

- **Run Directory**: `logs/run_<YYYYMMDD_HHMMSS>/`
- **Active Symlink**: `logs/latest/` points to the current active execution directory.

| Log Sink File | Source Process | Inspection Command |
| :--- | :--- | :--- |
| `logs/latest/api.log` | Express Node.js API Service | `tail -f logs/latest/api.log` |
| `logs/latest/worker.log` | Python Ingestion Worker | `tail -f logs/latest/worker.log` |
| `logs/latest/frontend.log` | Next.js Frontend SPA | `tail -f logs/latest/frontend.log` |
| `logs/latest/prisma.log` | Prisma Schema & Migration Sync | `cat logs/latest/prisma.log` |
| `logs/latest/docker/localstack.log` | LocalStack AWS Emulation | `tail -f logs/latest/docker/localstack.log` |
| `logs/latest/docker/ollama.log` | Ollama Local LLM Engine | `tail -f logs/latest/docker/ollama.log` |
| `logs/latest/docker/db.log` | PostgreSQL + pgvector Engine | `tail -f logs/latest/docker/db.log` |

---

## Local Service Endpoints

Once the startup script completes, the platform is reachable at the following endpoints:

| Service Interface | URL Endpoint | Description |
| :--- | :--- | :--- |
| **Frontend Workspace** | `http://localhost:3001` | Next.js React SPA with drag-and-drop uploads and chat |
| **API Server** | `http://localhost:3000` | Express REST API and SSE event stream gateway |
| **API Health Check** | `http://localhost:3000/health` | Service health status and database connectivity check |
| **Swagger UI Documentation** | `http://localhost:3000/api-docs` | Interactive OpenAPI 3.0 contract documentation |
| **LocalStack AWS Endpoint** | `http://localhost:4566` | S3 bucket and SQS queue inspection endpoint |
| **Ollama Local LLM** | `http://localhost:11434` | Local model inference and catalog API |
| **PostgreSQL Connection** | `localhost:5432` | Database `docintel`, user `postgres`, password `postgres` |

---

## Clean Shutdown & Signal Handling

The local launcher traps `SIGINT` (Ctrl+C), `SIGTERM`, and `EXIT` signals to guarantee zero dangling processes:

1. Sends termination signals to all recorded background application PIDs (`API`, `Worker`, `Frontend`).
2. Kills any lingering spawned sub-processes.
3. Automatically executes `docker compose down` to stop all containers and release system ports.
4. Preserves session logs under `logs/run_<timestamp>/` for post-run analysis.

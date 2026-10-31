# Context Handover: AI Document Intelligence Platform — Documentation Initiative (Phase 13)

## 1. Task Status Overview
- **Goal**: Implement Phase 13 of `DOCUMENTATION_PLAN.md` (§8 Implementation Order, Step 13) — Author comprehensive, production-grade Development & Local Environment documentation across all 5 development pages:
    - `docs-site/docs/development/local-setup.md` (Local Development Environment)
    - `docs-site/docs/development/api-standalone.md` (API Service Standalone Guide)
    - `docs-site/docs/development/worker-standalone.md` (Worker Service Standalone Guide)
    - `docs-site/docs/development/frontend-standalone.md` (Frontend Client Standalone Guide)
    - `docs-site/docs/development/environment-variables.md` (Environment Variables Reference)
- **Status (Complete & Verified)**:
    - **Streamlined Operational Focus**: Removed all visual flowchart/sequence diagrams from the Local Development Workflows pages (`local-setup.md`, `api-standalone.md`, `worker-standalone.md`, `frontend-standalone.md`, `environment-variables.md`). These documents now serve as purely operational, distraction-free runbooks and configuration reference tables, eliminating redundancy with the deeper architecture and services sections.
    - **Consolidated Navigation**: Nested the Development pages under `Deployment & CI/CD -> Local Development Workflows` in `mkdocs.yml`, creating a cohesive deployment and developer workflow section.
    - **Strict Build Verification**: Executed `docs-site/.venv/bin/mkdocs build --strict -f docs-site/mkdocs.yml` with 0 errors and 0 warnings.
    - **Indentation Compliance**: Verified 100% compliance with MkDocs Python-Markdown 4-space list indentation standards across all created documents.

---

## 2. Artifacts Created & Modified

```text
/
├── docs/
│   └── context/
│       └── docs-site/
│           ├── phase-1.md                    # MkDocs scaffold & navigation
│           ├── phase-2.md                    # Root README & AWS architecture diagram
│           ├── phase-3.md                    # Microservice App READMEs
│           ├── phase-4.md                    # Infrastructure Terraform READMEs
│           ├── phase-5.md                    # Core Architecture Deep Dives
│           ├── phase-6.md                    # Architecture Decision Records
│           ├── phase-7.md                    # Engineering Challenge Post-Mortems
│           ├── phase-8.md                    # Database Architecture Deep Dives
│           ├── phase-9.md                    # Services Architecture Deep Dives
│           ├── phase-10.md                   # Infrastructure & Platform Deep Dives
│           ├── phase-12.md                   # Deployment & CI/CD Deep Dives
│           └── phase-13.md                   # Development & Standalone Guides (This Document)
└── docs-site/
    └── docs/
        └── development/
            ├── local-setup.md                # Multi-tier launcher, Docker emulation, log sinks, teardown
            ├── api-standalone.md             # Express TypeScript, Prisma migrations, strategy switching
            ├── worker-standalone.md          # Python consumer, schema reflection, checkpoint resumption
            ├── frontend-standalone.md        # Next.js 16, Tri-Mode MSW routing, decoupled config.js
            └── environment-variables.md      # Central reference catalog across all services & secrets
```

---

## 3. Implementation Details by Development Topic

### 3.1 Local Development Environment (`local-setup.md`)
- **Docker Compose Emulation Stack**:
    - PostgreSQL 16 with `pgvector` (`5432`) for relational and vector similarity operations.
    - LocalStack (`4566`) for S3 direct multipart uploads, SQS document queues, DLQ redrive, and S3 event notifications.
    - Ollama (`11434`) for offline local LLM completions via `llama3.2`.
- **Automated Multi-Tier Launcher (`scripts/start-local.sh`)**:
    - Automatic `.env` provisioning from `.env.example`.
    - Health-checked container initialization with `scripts/localstack/init-aws.sh` and `scripts/ollama/entrypoint.sh`.
    - Prisma schema push and Python venv verification.
    - Spawns API (port 3000), Worker daemon, and Frontend (port 3001) in background with dedicated log sinks under `logs/run_<timestamp>/` symlinked to `logs/latest/`.
- **Clean Signal Trapping**: Traps `SIGINT`/`SIGTERM`/`EXIT`, terminates child PIDs, and runs `docker compose down`.
- **Diagrams**:
    - Flowchart: Host applications, Docker Compose containers, and background log sinks.
    - Sequence diagram: Multi-step orchestration, resource initialization, and graceful shutdown loop.

### 3.2 API Service Standalone Guide (`api-standalone.md`)
- **Express 4.x TypeScript Gateway**:
    - Session authentication with cryptographic HMAC cookie signatures.
    - Presigned S3 upload policy generation and MIME/size constraint enforcement.
    - Real-time SSE progress streaming bridging PostgreSQL `LISTEN progress_{sessionId}`.
    - RAG retrieval engine with Bedrock Titan / Claude 3 Sonnet and local fallback.
- **Prisma Schema Management**:
    - `npx prisma db push` for rapid local iteration.
    - `npm run db:generate` for type-safe client generation.
    - `npm run db:migrate` for timestamped SQL migrations.
- **Provider Strategy Switching**: Local `@xenova/transformers` (`query: ` prefix) and Ollama (`llama3.2`) vs AWS Bedrock.
- **Verification & Testing**: Health endpoint (`GET /health`), interactive Swagger UI (`GET /api-docs`), and Jest unit suites (`npm test`).
- **Diagram**: Flowchart mapping inbound traffic to controllers, Prisma client, strategy providers, and backing stores.

### 3.3 Worker Service Standalone Guide (`worker-standalone.md`)
- **Python 3.11 Consumer Daemon**:
    - Event-driven SQS 20-second long-polling with 600-second visibility timeout.
    - PyMuPDF in-memory streaming text extraction.
    - Sliding-window semantic chunker (~500 tokens, 75 overlap).
    - Dense vector generation (Bedrock Titan V2 or local `sentence-transformers` with `passage: ` prefix).
    - Idempotent upserts (`UNIQUE (document_id, chunk_index)`) in 50-chunk batches with `checkpoint_index`.
- **Unidirectional Schema Reflection (`scripts/generate_models.py`)**:
    - Invokes `sqlacodegen` against PostgreSQL to emit SQLAlchemy Declarative models in `app/models/generated_models.py`.
    - Enforces the Zero Raw SQL mandate across all worker operations.
- **Cooperative Teardown & Resumption**: Signal handling preserves unacknowledged SQS messages on mid-document interruption, allowing redelivery and checkpoint resumption from `checkpoint_index + 1`.
- **Diagrams**:
    - Flowchart: Worker daemon internal components, queues, and storage interactions.
    - Sequence diagram: Three-tier resiliency, 50-chunk checkpoint commits, and SQS visibility timeout recovery.

### 3.4 Frontend Client Standalone Guide (`frontend-standalone.md`)
- **Next.js 16 (React 19, Tailwind CSS v4) SPA**: Statically exported (`output: 'export'`) client served via S3 and CloudFront.
- **Tri-Mode API Architecture**:
    - **Standalone Mock Mode (`mock`)**: Zero-backend offline development powered by Mock Service Worker (`MSW`). Intercepts all REST and SSE endpoints with realistic data and token streaming.
    - **Full Live Mode (`api`)**: Direct routing to Express API at `http://localhost:3000`.
    - **Hybrid Mode (`hybrid`)**: Default dev mode with interactive floating `<DevToolbar />` to toggle mocking per feature.
- **Decoupled Runtime Configuration (`config.js`)**:
    - Solves the multi-environment rebuild anti-pattern.
    - Resolves configuration dynamically via `window.__APP_CONFIG__` -> `process.env` -> relative path `/api`.
- **Commands**: `npm run dev:local` (port 3001), `npm run dev:prod`, `npm run build` (static export validation), `npm run lint`.
- **Diagrams**:
    - Flowchart: Tri-mode network routing and MSW request interception.
    - Sequence diagram: Decoupled `config.js` script injection and dynamic endpoint binding.

### 3.5 Environment Variables Reference (`environment-variables.md`)
- **Authoritative Central Reference**: Comprehensive catalog encompassing all configuration keys, secret keys, defaults, and descriptions across:
    - Root / Infrastructure & Docker Compose (`.env.example`)
    - Express API Service (`apps/api/.env.example`)
    - Python Ingestion Worker (`apps/worker/.env.example`)
    - Next.js Frontend Client (`apps/frontend/.env.*` & `config.js`)
- **Security & Secret Handling Invariants**:
    - Zero committed static passwords; RDS IAM Database Authentication with 15-minute token rotation.
    - Sensitive values mounted into pods via AWS Secrets Store CSI Driver from AWS Secrets Manager into RAM-backed `tmpfs`.
    - Decoupled static frontend builds containing zero embedded cloud credentials.

---

## 4. Verification Records

- **Strict Build Verification**:
    ```bash
    docs-site/.venv/bin/mkdocs build --strict -f docs-site/mkdocs.yml
    ```
    Result: 0 errors, 0 warnings, completed in 2.57s.
- **Python-Markdown Indentation Compliance**:
    Total indentation issues: 0 (All 5 files conform to 4-space list indentation).

---
title: "API Service Standalone Guide"
description: "Local development setup, Prisma migration workflow, environment variables, and testing for the Express API service."
---

# API Service Standalone Guide

> Comprehensive operational guide for running, migrating, configuring, and testing the Express TypeScript API Gateway as an independent microservice.

---

## Prerequisites & Dependencies

Before running the API service independently, ensure the following tools are installed:

- **Node.js**: Version 24 LTS or higher.
- **npm**: Version 11 or higher.
- **PostgreSQL**: Version 16 with the `pgvector` extension installed and running (via Docker or local service).
- **LocalStack** (Optional): Required for presigned S3 upload URL generation and validation.

---

## Environment Configuration

Configure the service environment variables by copying `.env.example` to `.env` inside `apps/api/`:

| Configuration Key | Local Default | Production Invariant | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | `3000` | Set via container env | Port for the Express HTTP server |
| `NODE_ENV` | `local` | `production` | Runtime mode controlling error verbosity |
| `DATABASE_URL` | `postgresql://...` | Dynamic via IAM | Relational and vector database connection string |
| `DB_IAM_AUTH_ENABLED` | `false` | `true` | Toggles RDS IAM token auth vs static passwords |
| `SESSION_SECRET` | Dev secret string | AWS Secrets Manager | Cryptographic key for HMAC cookie signatures |
| `S3_BUCKET` | `documents-bucket` | S3 bucket name | Target bucket for presigned upload authorization |
| `LOCALSTACK_URL` | `http://localhost:4566` | Unset / Empty | Endpoint override redirecting S3 calls to LocalStack |
| `EMBEDDING_PROVIDER` | `local` | `bedrock` | Selects embedding provider strategy (`local` or `bedrock`) |
| `LLM_PROVIDER` | `local` | `bedrock` | Selects completion model strategy (`local` or `bedrock`) |

---

## Database Schema Management (Prisma)

Prisma serves as the **Single Source of Truth** for the entire database layer. All migrations and vector extension registrations must originate here:

### 1. Rapid Development Schema Push
During active local development, sync the schema directly to PostgreSQL without generating intermediate migration files:

- Command: `npx prisma db push`
- Synchronizes tables, composite keys, and triggers directly to the active database.

### 2. Client Artifact Generation
Whenever `prisma/schema.prisma` is modified, regenerate the type-safe Prisma client:

- Command: `npm run db:generate` (or `npx prisma generate`)
- Emits typed models to `node_modules/@prisma/client`.

### 3. Production Migration Creation
When preparing changes for deployment, record a formal migration file:

- Command: `npm run db:migrate` (or `npx prisma migrate dev`)
- Generates a timestamped SQL migration in `prisma/migrations/`.

---

## Provider Strategy Switching

The API service uses the Strategy Pattern to decouple business logic from AI model providers:

| Provider Mode | Embedding Configuration | LLM Completion Configuration | Local Infrastructure Requirement |
| :--- | :--- | :--- | :--- |
| **Local Mode** | `EMBEDDING_PROVIDER=local`<br/>`EMBEDDING_MODEL=Xenova/e5-large-v2` | `LLM_PROVIDER=local`<br/>`LLM_MODEL=llama3.2`<br/>`LLM_ENDPOINT=http://localhost:11434` | Ollama running `llama3.2` on port 11434; in-process CPU inference for Xenova |
| **Cloud Bedrock Mode** | `EMBEDDING_PROVIDER=bedrock`<br/>`EMBEDDING_MODEL=amazon.titan-embed-text-v2:0` | `LLM_PROVIDER=bedrock`<br/>`LLM_MODEL=anthropic.claude-3-haiku-20240307-v1:0` | AWS credentials with `bedrock:InvokeModel` permissions |

> [!NOTE]
> The local embedding provider uses `@xenova/transformers` to run `e5-large-v2` directly inside the Node.js process using ONNX runtime, prepending the asymmetric `query: ` prefix to all search prompts.

---

## Standalone Service Execution

### Starting the Development Server
Run the service with `nodemon` for automatic TypeScript compilation and hot-reloading:

- Command: `npm run dev`
- Starts Express listening at `http://localhost:3000`.

### Health & Contract Verification
Verify operational health and inspect interactive endpoint specifications:

- **Health Check**: Send `GET /health` to verify database pool connectivity.
- **Swagger UI**: Navigate to `http://localhost:3000/api-docs` in a browser.
- **Regenerate OpenAPI Spec**: `npm run api:docs:generate` parses JSDoc comments to update the OpenAPI schema file.

### Running Automated Test Suites
Execute the Jest unit test suites with coverage reports:

- Command: `npm test`
- Runs unit tests for session signing, validation schemas, query parsers, and citation grounders.

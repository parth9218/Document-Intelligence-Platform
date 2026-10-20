# Express API Service

<p align="center">
  <strong>High-concurrency Node.js & TypeScript API gateway handling session lifecycle, direct S3 upload negotiation, real-time ingestion SSE streaming, and grounded RAG query execution.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.4" />
  <img src="https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-5.14-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma ORM" />
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/AWS_Bedrock-Titan_&_Claude-232F3E?style=flat-square&logo=amazonwebservices&logoColor=white" alt="AWS Bedrock" />
</p>

<p align="center">
  <a href="#overview">Overview</a> &bull;
  <a href="#core-technologies--dependencies">Dependencies</a> &bull;
  <a href="#architecture--request-lifecycle">Architecture</a> &bull;
  <a href="#plugin-based-provider-strategy">Plugin Providers</a> &bull;
  <a href="#local-development">Local Setup</a> &bull;
  <a href="#docker-containerization">Docker Build</a> &bull;
  <a href="https://parth9218.github.io/Document-Intelligence-Platform/">📖 Full Documentation</a>
</p>

---

## Overview

The **Express API Service** serves as the client-facing gateway of the AI Document Intelligence Platform. Built with Node.js and TypeScript on Express, it is architected for asynchronous I/O and concurrent Server-Sent Events (SSE) connections.

The service manages cryptographically signed user sessions (HMAC-SHA256), enforces multi-tenant query boundaries, pre-authorizes direct-to-S3 document uploads with AWS SDK v3 Presigned POST policies, publishes real-time ingestion progress from PostgreSQL `LISTEN/NOTIFY` channels, and runs grounded vector similarity searches using pgvector and Amazon Bedrock.

---

## Core Technologies & Dependencies

| Dependency                             | Purpose                             | Production Implementation                                                     |
| :------------------------------------- | :---------------------------------- | :---------------------------------------------------------------------------- |
| `express`                              | Web application framework           | Implements layered routes, controllers, middleware, and SSE endpoints         |
| `@prisma/client` & `prisma`            | Database ORM                        | Source of truth for database schema; manages SQL migrations and queries       |
| `@prisma/adapter-pg` & `pg`            | PostgreSQL driver & connection pool | Low-level connection pooling (`pgPool`) for SSE `LISTEN/NOTIFY` events        |
| `@aws-sdk/s3-presigned-post`           | S3 Direct upload pre-authorization  | Generates presigned POST policies with file size and MIME restrictions        |
| `@aws-sdk/client-bedrock-runtime`      | Generative AI integration           | Invokes Amazon Titan Embeddings V2 and streams Claude 3.5 Sonnet responses    |
| `@aws-sdk/rds-signer`                  | IAM Database Authentication         | Generates temporary IAM database connection tokens with 10-minute caching     |
| `@xenova/transformers`                 | Offline local embeddings            | In-memory `intfloat/e5-large-v2` embedding generation for local development   |
| `cors`                                 | Cross-Origin Resource Sharing       | Dynamic origin reflection in dev; strict whitelist enforcement in production  |
| `winston`                              | Structured logging                  | Outputs JSON logs in staging/prod and colorized human-readable logs locally   |
| `swagger-ui-express` & `swagger-jsdoc` | OpenAPI documentation               | Generates and serves interactive API docs (conditionally bundled in dev only) |

---

## Architecture & Request Lifecycle

The API adopts a layered modular pattern that strictly decouples routing, validation, business orchestration, and data access.

```mermaid
flowchart TD
    Client["Client / Frontend"] -->|HTTP Request / Cookie| GlobalMW

    subgraph Middleware_Layer ["1. Global Middleware Layer"]
        GlobalMW["Express Pipeline"] --> CORS["CORS Middleware (ADR-018)"]
        CORS --> BodyParser["express.json() & requestLogger"]
        BodyParser --> SessionAuth["Session Middleware (HMAC-SHA256)"]
    end

    SessionAuth --> Routers["Express Route Handlers"]

    subgraph Routing_and_Controllers ["2. Routes, Validation & Controllers"]
        Routers --> DocRoute["/api/documents"]
        Routers --> QueryRoute["/api/query"]
        Routers --> SessRoute["/api/session"]

        DocRoute --> DocVal["validateBatchUploadInit (POST only)"]
        DocVal --> DocCtrl["DocumentController"]
        DocRoute -->|SSE / Status| DocCtrl

        QueryRoute --> QueryVal["validateQuerySearch"]
        QueryVal --> QueryCtrl["QueryController"]

        SessRoute --> SessCtrl["SessionController"]
    end

    subgraph Service_Layer ["3. Service Layer"]
        DocCtrl --> DocService["DocumentService"]
        DocService --> S3Service["S3Service (Presigned POST)"]
        
        QueryCtrl --> SearchService["SearchService"]
        QueryCtrl --> PromptUtils["Prompt Builder & CitationValidator"]
        QueryCtrl --> LLMService["LlmService (ILlmProvider)"]

        DocCtrl -.->|connectProgressStream| DocService
    end

    subgraph Data_Layer ["4. Data & External AI Providers"]
        DocService -->|Metadata & Transactions| Prisma["Prisma Client"]
        DocService -->|LISTEN progress_sessionId| PGPool["Raw pg Pool Client"]
        
        SearchService -->|embedQuery| EmbedService["EmbeddingService (IEmbeddingProvider)"]
        EmbedService -->|1024-dim Vector| Titan["Titan Embeddings V2 / Local E5"]
        SearchService -->|prisma.$queryRaw <=>| PGVector["PostgreSQL (pgvector)"]
        
        LLMService -->|streamCompletion| Claude["Bedrock Claude 3.5 / Ollama"]
        S3Service -->|Generate Policy| S3["Amazon S3 Bucket"]
    end
```

### Key Responsibilities

1. **HMAC-SHA256 Session Tenancy**: Sessions are tracked via a tamper-proof signed cookie (`session_token`). Database queries enforce tenant isolation at the query layer using parameterized `session_id` filters (`WHERE c.session_id = $1`).
2. **Two-Tier Upload Pre-Flight**: `POST /api/documents` accepts multi-file batches, executing independent per-file MIME/size checks and atomic session-level limits (max 5 concurrent uploads, 50 MB cumulative quota).
3. **Session-Scoped SSE Streams (`GET /api/documents/progress`)**: Maintains a single persistent SSE connection per session. On connection, it emits a `snapshot` event of all documents, then streams `update` events triggered by PostgreSQL `LISTEN progress_{sessionId}` notifications.
4. **Grounded Q&A & Citation Verification**: Embeds queries, fetches top-5 cosine similarity matches (`<=>`), builds bracketed prompts (`[1]...[n]`), and streams tokens from Claude while validating and deduplicating citation tags in real-time.

---

## Plugin-Based Provider Strategy

The API implements the **Strategy Pattern** for both embeddings and LLM generation. This allows the service to switch between AWS cloud services and offline local containers at runtime using environment variables:

```mermaid
classDiagram
    class IEmbeddingProvider {
        <<interface>>
        +embedQuery(text: string) Promise~number[]~
    }
    class BedrockEmbeddingProvider {
        +embedQuery(text: string) Promise~number[]~
    }
    class LocalEmbeddingProvider {
        +embedQuery(text: string) Promise~number[]~
    }
    IEmbeddingProvider <|.. BedrockEmbeddingProvider
    IEmbeddingProvider <|.. LocalEmbeddingProvider

    class ILlmProvider {
        <<interface>>
        +streamCompletion(systemPrompt: string, userMessage: string, signal: AbortSignal) AsyncGenerator~StreamChunk~
    }
    class BedrockLlmProvider {
        +streamCompletion(systemPrompt: string, userMessage: string, signal: AbortSignal) AsyncGenerator~StreamChunk~
    }
    class LocalLlmProvider {
        +streamCompletion(systemPrompt: string, userMessage: string, signal: AbortSignal) AsyncGenerator~StreamChunk~
    }
    ILlmProvider <|.. BedrockLlmProvider
    ILlmProvider <|.. LocalLlmProvider
```

- **Embeddings Factory (`EMBEDDING_PROVIDER`)**:
  - `bedrock`: Invokes `amazon.titan-embed-text-v2:0` (1024 dimensions) with exponential backoff.
  - `local`: Runs `@xenova/transformers` with `Xenova/e5-large-v2`. **Asymmetric Prefix Rule**: API prepends `query: ` to queries, matching the Worker's `passage: ` prefix used during document indexing.
- **LLM Factory (`LLM_PROVIDER`)**:
  - `bedrock`: Invokes `anthropic.claude-3-5-sonnet-20241022-v1:0` via AWS Bedrock Runtime streaming.
  - `local`: Connects to a local [Ollama](https://ollama.com/) instance (`http://localhost:11434`) running `llama3.2`.

---

## Local Development

### Prerequisites

- **Node.js**: `v24.x` or higher
- **PostgreSQL with pgvector**: Running locally on `localhost:5432`
- **LocalStack**: Emulating S3 on `http://localhost:4566`
- **Ollama** (optional, for local LLM inference): Running on `http://localhost:11434`

### Setup Instructions

1. **Configure Environment Variables**:

   ```bash
   cp .env.example .env
   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Apply Database Migrations & Generate Prisma Client**:

   ```bash
   npm run db:migrate
   npm run db:generate
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   The API will start with hot-reload enabled at `http://localhost:3000`. Swagger documentation is available at `http://localhost:3000/api-docs`.

### Key Environment Variables

| Variable              | Default (Local)                                          | Purpose                                                         |
| :-------------------- | :------------------------------------------------------- | :-------------------------------------------------------------- |
| `PORT`                | `3000`                                                   | HTTP port for the Express application                           |
| `NODE_ENV`            | `local`                                                  | Environment mode (`local`, `development`, `production`, `test`) |
| `DATABASE_URL`        | `postgresql://postgres:postgres@localhost:5432/docintel` | PostgreSQL connection string                                    |
| `DB_IAM_AUTH_ENABLED` | `false`                                                  | Enable IAM database connection token generation for RDS         |
| `SESSION_SECRET`      | _(random dev key)_                                       | Secret key used for signing HMAC-SHA256 session tokens          |
| `S3_BUCKET`           | `documents-bucket`                                       | Target S3 bucket name for document storage                      |
| `LOCALSTACK_URL`      | `http://localhost:4566`                                  | S3 mock endpoint for local development                          |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:3001`                                  | Production CORS allowed origin (dynamically reflected locally)  |
| `EMBEDDING_PROVIDER`  | `local`                                                  | Embedding provider (`local` or `bedrock`)                       |
| `LLM_PROVIDER`        | `local`                                                  | LLM text generation provider (`local` or `bedrock`)             |
| `LLM_ENDPOINT`        | `http://localhost:11434`                                 | Ollama API endpoint for local LLM inference                     |

---

## Docker Containerization

The API uses a hardened **two-stage multi-stage Docker build** (`builder` and `runner`) targeting `node:24-alpine`:

```mermaid
flowchart LR
    subgraph Builder_Stage ["Stage 1: builder"]
        B1["node:24-alpine"] --> B2["Download RDS CA Bundle"]
        B2 --> B3["npm ci & prisma generate"]
        B3 --> B4{"ARG ENVIRONMENT"}
        B4 -->|dev| B5["Generate Swagger JSON"]
        B4 -->|prod| B6["Uninstall swagger-ui-express & stub {}"]
        B5 & B6 --> B7["npm run build && npm prune --production"]
    end

    subgraph Runner_Stage ["Stage 2: runner"]
        R1["node:24-alpine"] --> R2["Create non-root user (UID 1001)"]
        R2 --> R3["Copy compiled dist/, node_modules/, & CA bundle"]
        R3 --> R4["USER 1001"]
        R4 --> R5["CMD ['npm', 'start']"]
    end

    B7 -->|Copy artifacts| R3
```

### Dual Image Variants in CI/CD

The CI/CD pipeline builds two distinct image variants in parallel from the same Dockerfile using build arguments:

- **Full Image (`ENVIRONMENT=dev`)**: Retains `swagger-ui-express` and pre-compiles Swagger OpenAPI specs for development and sandbox environments (`${SHORT_SHA}`).
- **Slim Image (`ENVIRONMENT=prod`)**: Uninstalls `swagger-ui-express` and strips Swagger files to minimize the production attack surface and container size (`${SHORT_SHA}-slim`).

```bash
# Build production slim container locally
docker build --build-arg ENVIRONMENT=prod -t docintel-api:slim .

# Build development container with Swagger enabled
docker build --build-arg ENVIRONMENT=dev -t docintel-api:full .
```

---

## Key Scripts

| Command                     | Description                                                           |
| :-------------------------- | :-------------------------------------------------------------------- |
| `npm run dev`               | Starts API with `nodemon` and `ts-node` for hot-reload development    |
| `npm run build`             | Compiles TypeScript source to JavaScript into `dist/`                 |
| `npm start`                 | Executes production entrypoint from `dist/index.js`                   |
| `npm run db:migrate`        | Runs Prisma schema migrations against the PostgreSQL database         |
| `npm run db:generate`       | Regenerates Prisma Client types from `prisma/schema.prisma`           |
| `npm run api:docs:generate` | Parses JSDoc annotations and generates OpenAPI `swagger.json`         |
| `npm test`                  | Executes Jest integration test suite                                  |
| `npm run test:trigger`      | Standalone script testing PostgreSQL `LISTEN/NOTIFY` trigger delivery |

---

## Documentation Links

- [API Architecture & Layered Design](https://parth9218.github.io/Document-Intelligence-Platform/services/api/overview/)
- [Session Management & HMAC Security](https://parth9218.github.io/Document-Intelligence-Platform/services/api/session-management/)
- [Real-Time Progress & SSE Architecture](https://parth9218.github.io/Document-Intelligence-Platform/services/api/realtime-progress/)
- [RAG Query Engine & Citation Verification](https://parth9218.github.io/Document-Intelligence-Platform/services/api/query-engine/)
- [RDS IAM Database Authentication](https://parth9218.github.io/Document-Intelligence-Platform/services/api/rds-iam-auth/)
- [Container Build & Slim Variants](https://parth9218.github.io/Document-Intelligence-Platform/services/api/docker-build/)

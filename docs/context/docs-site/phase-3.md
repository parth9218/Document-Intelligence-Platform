# Context Handover: AI Document Intelligence Platform — Documentation Initiative (Phase 3)

## 1. Task Status Overview
- **Goal**: Implement Phase 3 of `DOCUMENTATION_PLAN.md` — Author comprehensive, production-grade service README files for all three core decoupled applications:
  - `apps/api/README.md` (Express TypeScript API Gateway)
  - `apps/worker/README.md` (Python Asynchronous SQS Ingestion Worker)
  - `apps/frontend/README.md` (Next.js 16 App Router Static Client)
- **Status (Complete & Verified)**:
  - All three service entry points fully authored with executive architectural framing, shields.io technology badges, core dependency matrices, request lifecycle Mermaid diagrams, plugin provider strategy patterns, local standalone execution steps, and live hyperlinks to the hosted documentation website (`https://parth9218.github.io/Document-Intelligence-Platform/`).
  - Architecture diagrams and lifecycle descriptions across all services strictly reconciled with actual code implementations.

---

## 2. Artifacts Created & Modified

```text
/
├── .github/
│   └── workflows/
│       ├── api-worker-cicd.yml               # Excluded README.md from container builds & git-diff triggers
│       └── frontend-deploy.yml               # Excluded README.md from static frontend deployment triggers
├── apps/
│   ├── api/
│   │   └── README.md                         # Authoritative API service README (Node 24, Express, Prisma, pgvector)
│   ├── worker/
│   │   └── README.md                         # Authoritative Worker daemon README (Python 3.11, SQS, PyMuPDF, SQLAlchemy)
│   └── frontend/
│       └── README.md                         # Authoritative Frontend client README (Next.js 16, React 19, Tailwind v4, MSW)
└── docs/
    └── context/
        └── docs-site/
            ├── phase-1.md                    # Phase 1 context (MkDocs scaffold & navigation)
            ├── phase-2.md                    # Phase 2 context (Root README & AWS architecture diagram)
            └── phase-3.md                    # Phase 3 context (Microservice App READMEs)
```

---

## 3. Implementation Details by Service

### 3.1 Express API Service (`apps/api/README.md`)
1. **Request Lifecycle & Architecture Flowchart**:
   - Corrected Express execution sequence: global middlewares (`cors`, `express.json()`, `requestLogger`, `sessionMiddleware`) process requests prior to route matching.
   - Added explicit **Controller Layer** (`DocumentController`, `QueryController`, `SessionController`) orchestrating requests between routers and underlying business services.
   - Replaced generic validation step with route-specific validators (`validateBatchUploadInit` for uploads and `validateQuerySearch` for similarity queries).
   - Replaced phantom `SSEService` with `DocumentController` calling `DocumentService.connectProgressStream()` using a dedicated `pgPool` client listening to PostgreSQL channel `progress_{sessionId}`.
   - Corrected query embedding attribution: `SearchService` generates query embeddings via `EmbeddingService` (`IEmbeddingProvider` / Titan Embeddings V2) and runs cosine similarity queries via `prisma.$queryRaw`, while `LlmService` (`ILlmProvider` / Claude 3.5 Sonnet) handles prompt completion streaming.
2. **Provider Strategy Architecture**:
   - Aligned interface signatures: `IEmbeddingProvider` with `+embedQuery(text: string): Promise<number[]>` and `ILlmProvider` with `+streamCompletion(systemPrompt: string, userMessage: string, signal: AbortSignal): AsyncGenerator<StreamChunk>`.
   - Documents the asymmetric E5 prefix convention (`query: ` in API vs `passage: ` in Worker).
3. **Multi-Stage Container Packaging**:
   - Documents the two-stage build (`builder` and `runner`) and the dual image matrix in CI (`ENVIRONMENT=dev` bundling Swagger UI vs `ENVIRONMENT=prod` stripping Swagger UI for a lightweight production slim container).

### 3.2 Python Ingestion Worker (`apps/worker/README.md`)
1. **Architectural Role & Flowchart Alignment**:
   - Decoupled asynchronous worker daemon scaling 0→10 pods via KEDA based on Amazon SQS queue depth.
   - Updated pipeline flowchart to show `Consumer` (not `Repo`) deleting acknowledged SQS messages upon complete job execution.
2. **Idempotency & Resiliency**:
   - Documents the three-tier idempotency strategy: composite upsert key `UNIQUE(document_id, chunk_index)` with `ON CONFLICT DO UPDATE`, and batch checkpoint resumption (`checkpoint_index`) per 50 chunks.
   - **Graceful Shutdown & Visibility Expiration**: Clarified that receiving `SIGTERM` or `SIGINT` sets a cooperative `shutdown_requested` flag that prevents the consumer from pulling *new* SQS messages. SQS messages are acknowledged and deleted **strictly after the entire document workflow completes**. If a pod terminates mid-document, the message is left unacknowledged, allowing its SQS visibility timeout (600s) to expire so a replacement pod picks it up and resumes from `checkpoint_index + 1`.
   - Documents the secondary background thread monitoring the Dead Letter Queue (DLQ) to mark abandoned poison-pill jobs as `failed`.
3. **Provider Strategy Architecture**:
   - Documents the `EmbeddingProvider` ABC supporting Bedrock Titan V2 and offline CPU `sentence-transformers` using `intfloat/e5-large-v2` with `passage: ` prefixing.

### 3.3 Next.js Frontend Client (`apps/frontend/README.md`)
1. **Architectural Role**:
   - Client-side Single Page Application built on Next.js 16.2 App Router with React 19 and Tailwind CSS v4, compiled as a static export (`output: 'export'`) and distributed globally via Amazon S3 and CloudFront.
2. **Component & Hook Topology**:
   - Documents decoupled UI components (`UploadZone`, `ProcessingFeed`, `ChatInterface`), custom hooks (`useUpload`, `useIngestion`, `useQuery`, `useAuth`), and global state management via Zustand (`useAppStore`).
   - Details direct S3 multipart uploads with real-time byte progress via `XMLHttpRequest` (`s3-uploader.ts`), SSE ingestion progress streaming with 3-second polling fallback, and grounded conversational citations with interactive hover popovers.
3. **Decoupled Runtime Configuration (`config.js`)**:
   - Explains the runtime configuration priority chain (`window.__APP_CONFIG__` -> `process.env.NEXT_PUBLIC_*` -> relative path) eliminating rebuild anti-patterns across environments.
4. **Hybrid API Routing & MSW Engine**:
   - Documents the Mock Service Worker (MSW) engine allowing full offline client development with the interactive floating `<DevToolbar />`.
5. **CloudFront Unified Ingress**:
   - Documents how routing `/api/*` through CloudFront to the internal ALB resolves browser HTTPS/HTTP mixed-content errors without requiring a custom domain.

### 3.4 CI/CD Path Exclusions
- Updated `.github/workflows/api-worker-cicd.yml` and `.github/workflows/frontend-deploy.yml` `on.push.paths` to explicitly exclude `!apps/**/README.md`.
- Updated `api-worker-cicd.yml` in-job git diff detection to ignore README files, ensuring documentation edits never trigger container builds or static site deployments.

---

## 4. Next Steps in the Implementation Roadmap

According to `DOCUMENTATION_PLAN.md` (§8 Implementation Order):
- **Step 4**: Infra READMEs (`infra/terraform/aws/README.md`, `infra/terraform/k8s/README.md`, `infra/terraform/query/README.md`).
- **Step 5**: Core Architecture Documentation (`docs-site/docs/architecture/` - `overview.md`, `data-flow.md`, `technology-stack.md`, `cost-optimization.md`).

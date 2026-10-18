# Documentation Implementation Plan

You are tasked with building the complete documentation for the **AI Document Intelligence Platform** — a production-grade, multi-tenant Retrieval-Augmented Generation (RAG) platform deployed on AWS EKS.

This plan is the authoritative guide. Follow it precisely.

---

## Table of Contents

1. [Project Context](#1-project-context)
2. [Documentation Scope](#2-documentation-scope)
3. [Critical Rules & Corrections](#3-critical-rules--corrections)
4. [Tone & Positioning Guidelines](#4-tone--positioning-guidelines)
5. [Part 1: README Files](#5-part-1-readme-files)
6. [Part 2: Documentation Website (MkDocs Material)](#6-part-2-documentation-website-mkdocs-material)
7. [Source Material References](#7-source-material-references)
8. [Implementation Order](#8-implementation-order)

---

## 1. Project Context

### What This Project Is

A cloud-native RAG platform where users upload PDF documents, which are processed into vector embeddings, and then users query those documents to receive streaming AI-generated answers with verified citations. It demonstrates:
- **AWS DevOps Engineer Professional** capabilities (EKS, IAM, RDS, SQS, S3, KMS, Secrets Manager)
- **Certified Kubernetes Administrator** skills (Deployments, Gateway API, HPA/KEDA, Pod Security)
- **GitOps workflows** via ArgoCD

### Who Will Read This Documentation

Primarily **potential recruiters**, **hiring managers**, and **browsing developers** evaluating the project owner as a **senior cloud architect**, **senior cloud developer**, and **senior platform engineer**. The documentation must demonstrate deep architectural thinking, trade-off analysis, and production-grade engineering decisions.

### Architecture Summary

Three polyglot services:
- **API Service** (`apps/api/`): TypeScript Express server — session auth, presigned uploads, SSE progress streaming, RAG query engine with streaming citations
- **Worker Service** (`apps/worker/`): Python daemon — SQS consumer, PDF extraction, paragraph chunking, vector embedding, idempotent storage with checkpoint resume
- **Frontend** (`apps/frontend/`): Next.js React SPA — batch uploads, real-time processing feed, streaming Q&A chat with citation popovers. Statically exported and served from S3 via CloudFront.

Infrastructure:
- **AWS**: VPC, EKS, RDS PostgreSQL (pgvector), S3, SQS+DLQ, CloudFront, ECR, Secrets Manager, ACM
- **Kubernetes**: Gateway API + AWS LB Controller, ArgoCD (ApplicationSet with Multi-Source), KEDA (SQS + workload triggers), External Secrets Operator, Secrets Store CSI Driver
- **CI/CD**: GitHub Actions with tag-driven multi-environment pipelines, immutable artifact promotion, serialized GitOps commits

### Repository Structure

```
/apps/frontend/     — Next.js React client (Next.js App Router, TypeScript, Tailwind CSS v4)
/apps/api/          — TypeScript Express backend service
/apps/worker/       — Python async processing consumer
/infra/terraform/aws/     — Terraform modules for AWS resources
/infra/terraform/k8s/     — Terraform for Kubernetes platform components
/infra/terraform/query/   — Lightweight remote state query module (zero providers)
/infra/k8s/helm/          — Helm charts for API and Worker
/infra/k8s/argocd/        — ArgoCD GitOps tracking configs per environment
/.github/workflows/       — CI/CD pipeline definitions
/docs/context/            — Detailed architectural specifications (YOUR SOURCE MATERIAL)
/docs/progress/           — Implementation status tracking
/tasks/                   — Task specifications
```

---

## 2. Documentation Scope

You will produce two deliverables:

### Deliverable 1: README Files

| File | Purpose |
|------|---------|
| `/README.md` | Root — first impression, architecture overview, quality highlights, quick links |
| `/apps/api/README.md` | API service entry point |
| `/apps/worker/README.md` | Worker service entry point |
| `/apps/frontend/README.md` | Frontend entry point |
| `/infra/terraform/aws/README.md` | AWS infrastructure |
| `/infra/terraform/k8s/README.md` | Kubernetes infrastructure |
| `/infra/terraform/query/README.md` | Remote state query module |

### Deliverable 2: MkDocs Material Documentation Website

A comprehensive technical documentation site deployed via GitHub Pages. Every aspect of the project documented in detail with diagrams, sequence flows, and cross-references.

- **Encapsulated Package**: `/docs-site/` (self-contained documentation package, keeping the project root clean)
- **Configuration**: `/docs-site/mkdocs.yml` (theme, plugins, navigation structure)
- **Local Tooling**: `/docs-site/requirements.txt` (pip dependencies for running `mkdocs serve`)
- **Documentation Content**: `/docs-site/docs/` (Markdown pages, diagrams, assets)
- **CI/CD Automation**: `/.github/workflows/docs-deploy.yml` (GitHub Pages build and deployment pipeline)

---

## 3. Critical Rules & Corrections

These rules are non-negotiable. Violating them produces incorrect documentation.

### 3.1 Terminology Corrections

| ❌ DO NOT SAY | ✅ SAY INSTEAD | Reason |
|---------------|----------------|--------|
| IRSA (IAM Roles for Service Accounts) | **Pod Identity Association** | Project uses EKS Pod Identity Associations, the AWS-recommended successor to IRSA. Verified: `aws_eks_pod_identity_association` resources in `infra/terraform/aws/modules/eks/iam.tf` |
| Ingress / Ingress Controller | **Gateway API** / **HTTPRoute** | Project uses Kubernetes Gateway API with GatewayClass, Gateway, HTTPRoute. Verified: `infra/terraform/k8s/manifests/alb_gatewayclass.yaml`, `api_gateway.yaml`, `infra/k8s/helm/api/templates/httproute.yaml` |
| Row Level Security (RLS) | **Parameterized WHERE clause** / **session tenancy filter** | Tenant isolation is via `WHERE session_id = $1` in queries, NOT PostgreSQL RLS. Do not claim RLS. |
| CloudWatch (for observability) | **OpenTelemetry** (as planned) | The project plans to instrument with OpenTelemetry for vendor-neutral observability. CloudWatch is used passively (RDS metrics, SQS metrics for KEDA), but active instrumentation will be OTel. |
| Integration tests | **Unit tests** (for what exists) | Only unit tests exist currently. Integration tests are planned. Do not claim integration tests are implemented. |

### 3.2 Planned vs Implemented

Items marked 🚧 must be documented as **planned/designed** — not as currently running:

| Feature | Status | How to Document |
|---------|--------|-----------------|
| CI pipeline (PR → unit tests → merge gate) | 🚧 Planned | Describe the designed workflow. Use present tense like an RFC: "The CI pipeline validates PRs by..." but mark section header with 🚧 |
| Signed commits on release branches | 🚧 Planned | Describe as the designed security model for ArgoCD commit verification |
| OpenTelemetry instrumentation | 🚧 Planned | Describe the planned approach and justify choosing OTel over vendor-specific tools to avoid lock-in |
| NetworkPolicies / Kyverno (cluster hardening) | 🚧 Planned | Mention briefly under planned enhancements |
| Workflow status badges on README | 🚧 Planned | Don't include badge markdown; mention as planned |
| Integration / E2E tests | 🚧 Planned | Document testing strategy acknowledging these are planned |

### 3.3 Claims to Temper (Do NOT Overstate)

**PG NOTIFY / SSE Connection Architecture**:
- Document factually as a real-time event notification mechanism
- Do NOT boast about scalability — persistent connections from browsers to API to database are not ideal at scale
- RDS Proxy also discourages persistent connections
- Include explicit caveat: *"Suitable for the platform's designed concurrent session volume. At significantly higher scale, a dedicated message broker (e.g., Redis Pub/Sub) would replace PG NOTIFY."*

**Connection Pooling**:
- Mention `pgPool` and RDS Proxy factually for reference only
- Do not present persistent SSE database listeners as an architectural strength

### 3.4 Technical Details to Include

**Plugin/Strategy Provider Architecture** (both API and Worker):
- Both services use a Strategy pattern with factory functions for provider selection
- API: `EmbeddingProvider` interface → `BedrockEmbeddingProvider` / `LocalEmbeddingProvider`; `LlmProvider` interface → `BedrockLlmProvider` / `LocalLlmProvider`
- Worker: `EmbeddingProvider(ABC)` → `BedrockEmbeddingProvider` / `LocalEmbeddingProvider`
- Switched via `EMBEDDING_PROVIDER` and `LLM_PROVIDER` environment variables
- **Important asymmetric E5 detail**: Worker uses `"passage:"` prefix (for indexing), API uses `"query:"` prefix (for retrieval) — following the E5 model's asymmetric query-document design
- Document the class structure clearly

**Multi-Stage Docker Builds**:
- API: Two-stage build (`builder` and `runner`). Build arg `ENVIRONMENT=dev|prod`. In `dev`, it generates OpenAPI JSON and bundles `swagger-ui-express`. In `prod`, it uninstalls `swagger-ui-express` and stubs empty spec `{}` to minimize attack surface and image weight. CI builds **two variants in parallel** via matrix strategy:
  - `full` variant (`ENVIRONMENT=dev`): tagged `${SHORT_SHA}` — used in dev
  - `slim` variant (`ENVIRONMENT=prod`): tagged `${SHORT_SHA}-slim` — promoted to staging/production
- Worker: Two-stage build (`builder` and `runner`). `builder` downloads the AWS RDS CA bundle (`global-bundle.pem`). `runner` installs dependencies directly from `requirements.txt` into the container environment for non-root user `1001` and copies the CA bundle. No conditional image variants.

**KEDA Triggers** (verified from Helm templates):
- API: `http.keda.sh/v1beta1` `InterceptorRoute` and `ScaledObject` with `type: external-push` pointing to `keda-add-ons-http-external-scaler.keda.svc:9090` (KEDA HTTP Add-on), scaling on incoming HTTP request rate and concurrency.
- Worker: `aws-sqs-queue` trigger type with `TriggerAuthentication` (`podIdentity: provider: aws`), scales 0→10 on `queueLength` (`ApproximateNumberOfMessagesVisible`).

**Terraform Query Module** (critical — get this right):
- `infra/terraform/query/` has NO backend of its own
- `terraform init` is called with NO backend config (module uses only built-in `terraform_remote_state` data source)
- `terraform plan/apply -var-file=path/to/environments/{env}/backend.config.hcl` passes the target environment's state bucket coordinates (bucket, key, region) as variables
- The module queries that environment's remote state and outputs the results
- This avoids downloading AWS+K8s providers (60-90s savings in CI)

**ArgoCD Commit Pinning**:
- ArgoCD tracks exact commit SHAs via `config.json` files on release branches
- This avoids drift from tracking moving pointers (branches/tags)
- Release branches are under protection rules — only CI/CD pipelines can push
- Commits are signed so ArgoCD can verify the signer *(document as designed — signing not yet implemented)*

**First-Time Deployment Bootstrap**:
- After the dev pipeline performs automated commits, those commits are marked `[skip ci]`
- If another deployment is built from this commit, the release won't work
- Solution: Push empty commits after the first automated pipeline run to create a commit without `[skip ci]`

**Release Tag Alignment**:
- Release tags for staging/production MUST point to the commit from which lower environments had deployments
- Otherwise the artifact SHAs won't match, and the promotion pipeline will fail fast

**CloudFront Unified Routing Decision** (important story):
1. Frontend served from CloudFront via HTTPS
2. API behind ALB served via HTTP only
3. Browsers rejected mixed-content (HTTPS page calling HTTP API)
4. Did not want to purchase a domain for ACM-validated HTTPS on ALB
5. Decision: Route API traffic through CloudFront — paths with `/api` prefix forwarded to ALB origin
6. Result: Single CloudFront distribution serves both frontend static assets and API traffic

**Immutable Artifact Promotion** (emphasize throughout):
- Frontend: Built once, archived to S3 artifact bucket, promoted across environments. Runtime config injected via `config.js` (not compiled in)
- API/Worker containers: Built once in dev ECR, promoted to stg/prod ECR by retag/copy — zero rebuilding
- Helm charts: Packaged once in dev ECR (OCI), promoted by pull+repack+push — zero rebuilding

### 3.5 ARM64 Lock File Note (for Terraform READMEs)

Include in both AWS and K8s Terraform READMEs:

> ⚠️ If developing from an ARM64 machine (e.g., Apple Silicon), lock the dependency hashes with AMD64 platform hashes to hit Terraform plugin cache in CI environments:
> ```
> terraform providers lock -platform=linux_amd64
> ```
> Commit the updated `.terraform.lock.hcl`.

---

## 4. Tone & Positioning Guidelines

### Word Choice Rules

| ✅ Use | ❌ Avoid | Why |
|--------|----------|-----|
| "Designed and implemented" | "Built" | Signals intentional architecture |
| "Enforces tenant isolation at the query layer via parameterized statements" | "Filters by session ID" | Shows depth |
| "Defense-in-depth security model spanning session, transport, storage, and infrastructure layers" | "Is secure" | Shows layered thinking |
| "Strict artifact immutability — containers and assets are built once and promoted across environments without rebuilding" | "Deploys the same thing everywhere" | Shows process discipline |
| "Strategy/plugin architecture enabling runtime provider selection" | "Has different implementations" | Shows design pattern awareness |
| "Event-driven autoscaling with scale-to-zero capability" | "Auto-scales" | Shows specificity |
| "Pod Identity Association was chosen over IRSA for simplified credential binding without OIDC provider overhead" | State choices without rationale | Shows trade-off analysis |
| 🚧 for planned features | Claim unimplemented features are done | Shows honesty and roadmap thinking |

### General Principles

- Lead with the **problem solved**, not the technology stack
- Reference **trade-offs** explicitly: "We chose X over Y because..." — this is the hallmark of senior decision-making
- Present planned items honestly — seeing "🚧 Planned: X" shows forward thinking, which is better than claiming false completion
- Keep README files concise and scannable — save deep dives for the docs website
- Every page in the docs website should be self-contained but cross-reference related pages
- Diagrams are mandatory for: architecture overview, data flows, ER diagrams, CI/CD flows, infrastructure topology, ArgoCD sync mechanics

---

## 5. Part 1: README Files

### 5.1 Root `/README.md`

Structure:

```
1. Hero Section (centered)
   - Logo: apps/frontend/public/logo.png
   - Title: "AI Document Intelligence Platform"
   - Subtitle: "A production-grade, multi-tenant Retrieval-Augmented Generation platform on AWS EKS"
   - Technology badges (shields.io): TypeScript, Python, React, Next.js, PostgreSQL, AWS, Kubernetes, Terraform, ArgoCD, Docker
   - Quick links: [📖 Documentation](url) · [🏗️ Architecture](#architecture) · [🚀 Quick Start](#quick-start)

2. Overview (2-3 paragraphs)
   - What the platform does
   - Portfolio piece demonstrating AWS-DOP, CKA, senior cloud architecture

3. Architecture Diagram
   - Pre-rendered PNG/JPG with official AWS service icons
   - Generate offline using draw.io with AWS icon set or `diagrams` Python library
   - Show: Browser → CloudFront → ALB → API Pods (EKS), Browser → S3, S3 → SQS → Worker Pods (KEDA 0→10), RDS (pgvector), Bedrock
   - Embed as image: ![Architecture](docs-site/assets/architecture.png)

4. Architectural Qualities Table
   | Quality | Implementation |
   |---------|---------------|
   | 🔄 Event-Driven Scaling | KEDA scales worker pods 0→10 on SQS queue depth; API pods scale on workload concurrency |
   | 🔒 Zero Static Credentials | IAM Database Authentication, Pod Identity Associations, Secrets Store CSI Driver |
   | 🌐 Gateway API | Modern Kubernetes Gateway API with HTTPRoute over traditional Ingress |
   | 🔑 Dynamic Secret Injection | Secrets Manager via CSI Driver; ECR tokens rotated hourly via External Secrets Operator |
   | ♻️ Idempotent Processing | Checkpoint-based resume, upsert keys, at-least-once SQS delivery with safe retry |
   | 📦 Immutable Artifacts | Build once in dev, promote identical artifacts to staging and production |
   | ☁️ Direct S3 Uploads | Presigned POST with infrastructure-level policy enforcement |
   | 🔌 Plugin-Based Providers | Strategy pattern — swap between AWS Bedrock and local models via env var |
   | 🚀 GitOps Deployment | ArgoCD Multi-Source ApplicationSet pinned to exact commit SHAs |
   | 🔀 Serialized CI/CD | Concurrency groups prevent git ref contention across parallel pipelines |

5. Services Overview (brief descriptions with links to app READMEs)

6. Quick Start (link to docs website local setup page + one-liner docker-compose up)

7. Deployment Summary
   - Dev: PR → CI → tests → merge → push triggers deploy
   - Staging/Prod: Cut semver tag → promote artifact → approval → deploy
   - Link to docs website deployment pages

8. 🚧 Planned Enhancements
   - OpenTelemetry instrumentation (vendor-neutral)
   - PR validation pipeline with unit test gates
   - Signed commits on release branches
   - Cluster hardening (NetworkPolicies, Kyverno)
   - Workflow status badges

9. Documentation link

10. License / Author
```

### 5.2 App READMEs (`apps/api/README.md`, `apps/worker/README.md`, `apps/frontend/README.md`)

For each app, read the corresponding source code and the relevant `docs/context/*-spec.md` files. Include:

1. **Summary** (2-3 sentences)
2. **Technologies** list
3. **Core Dependencies Table** (package → purpose)
4. **High-Level Architecture/Function** (brief, with diagram if applicable)
5. **Plugin-Based Provider Architecture** (for API and Worker — describe the strategy pattern, factory functions, provider implementations)
6. **Running Locally** (standalone without docker-compose):
   - Prerequisites (what other services must be running)
   - Copy .env.example to .env
   - Install dependencies
   - Run command
   - Key environment variables table
7. **Docker Build** (multi-stage details, build args for API)
8. **Key Scripts Table** (command → description)
9. **Link to technical documentation website**

Read these files for each app to get accurate details:
- API: `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/config/index.ts`, `apps/api/.env.example`, `apps/api/Dockerfile`
- Worker: `apps/worker/requirements.txt`, `apps/worker/app/main.py`, `apps/worker/app/config/settings.py`, `apps/worker/Dockerfile`
- Frontend: `apps/frontend/package.json`, `apps/frontend/src/config/api-routing.ts`, `apps/frontend/public/config.js`, `apps/frontend/Dockerfile` (if exists)

### 5.3 Infrastructure READMEs

**`infra/terraform/aws/README.md`**:
- Summary of what it provisions
- Architecture diagram with AWS icons (pre-rendered image)
- Module descriptions table (read `infra/terraform/aws/modules/*/` to enumerate)
- Usage: `terraform init -backend-config=environments/{env}/backend.config.hcl` → `plan -var-file` → `apply -var-file`
- Required variables (read `infra/terraform/aws/variables.tf`)
- ARM64 lock file note
- Link to docs website

**`infra/terraform/k8s/README.md`**:
- Summary of K8s platform components
- Component table: AWS LB Controller, Gateway API, ArgoCD, External Secrets Operator, Secrets Store CSI Driver, KEDA
- Usage (same init/plan/apply pattern, depends on AWS module outputs)
- ARM64 lock file note
- Link to docs website

**`infra/terraform/query/README.md`**:
- Summary: Zero-provider module that reads remote state
- Usage (CRITICAL — get this right):
  ```
  terraform init                     # No backend config needed
  terraform plan -var-file=path/to/environments/{env}/backend.config.hcl
  terraform apply -var-file=path/to/environments/{env}/backend.config.hcl
  terraform output -json outputs
  ```
  The -var-file supplies target environment's state coordinates (bucket, key, region).
- Why it exists: avoids 60-90s provider download in CI

---

## 6. Part 2: Documentation Website (MkDocs Material)

### 6.1 Setup

Create a dedicated, self-contained MkDocs Material package under `/docs-site/`:

```
/docs-site/
├── mkdocs.yml               — MkDocs site configuration (theme, plugins, nav)
├── requirements.txt         — Python dependencies for documentation builds
└── docs/                    — Markdown documentation pages & assets
    ├── index.md             — Documentation homepage
    ├── assets/              — Images, diagrams, screenshots
    ├── architecture/        — System architecture specifications
    ├── design-decisions/    — Architecture decision records (ADRs)
    ├── challenges/          — Engineering challenges & post-mortems
    ├── database/            — Schema, vector indexes, triggers, ORM
    ├── services/            — API, Worker, and Frontend deep dives
    ├── infrastructure/      — AWS & Kubernetes Terraform modules
    ├── security/            — Auth, tenant isolation, network policies
    ├── deployment/          — CI/CD, GitOps, promotion pipelines
    ├── development/         — Local setup, standalone guides, env vars
    ├── testing/             — Test pyramid, unit/integration suites
    ├── observability/       — Logging, health checks, monitoring
    └── screenshots/         — UI walkthrough & platform visuals
```

**Clean Separation of Concerns (`docs-site/` vs `docs/`)**:
- The repository constitution (`GEMINI.md`) strictly reserves `/docs/` for internal project context recovery (`docs/context/`) and task progress tracking (`docs/progress/`).
- By placing `mkdocs.yml`, `requirements.txt`, and `docs/` inside `/docs-site/`, the root directory stays clean and documentation is managed as an independent module.
- Inside `docs-site/mkdocs.yml`, standard `docs_dir: docs` applies naturally.

**`docs-site/requirements.txt` dependencies**:
```
mkdocs-material>=9.5.0
pymdown-extensions>=10.7
mkdocs-mermaid2-plugin>=1.1.1
```

**`docs-site/mkdocs.yml` configuration**:
- Site name: `AI Document Intelligence Platform`
- Theme: `material` with dark/light mode toggle (palette switchers)
- Features: `navigation.instant`, `navigation.tracking`, `navigation.expand`, `content.code.copy`, `content.code.annotate`
- Extensions: `pymdownx.superfences` (with custom Mermaid fence), `pymdownx.tabbed`, `admonition`, `pymdownx.details`, `pymdownx.highlight`, `toc` with permalink
- Plugins: `search`
- Navigation: Explicitly defined left sidebar matching the structure below

**GitHub Pages CI/CD Pipeline (`.github/workflows/docs-deploy.yml`)**:
- Target: GitHub Pages with "GitHub Actions" source selected.
- Trigger: Push to `dev` branch affecting `docs-site/**` or `.github/workflows/docs-deploy.yml`.
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- Build Job: Checkout repository, setup Python 3.11+, install `docs-site/requirements.txt`, run `mkdocs build --config-file docs-site/mkdocs.yml --site-dir docs-site/site`, setup pages (`actions/configure-pages@v5`), and upload artifact (`actions/upload-pages-artifact@v3` with path `docs-site/site`).
- Deploy Job: Deploy to `github-pages` environment via `actions/deploy-pages@v4`.

### 6.2 Complete Page Structure & Content Guide

Below is every page in the documentation website. For each page, I provide:
- **What to cover**
- **Where to find source information** (files to read)
- **Diagrams to include**
- **Specific gotchas** from the brainstorming session

---

#### Section: Architecture

**`docs-site/architecture/overview.md`** — System Overview
- Component boundaries: Browser, API, Worker, S3, SQS, RDS, Bedrock
- Why polyglot: Node.js for concurrent SSE streaming, Python for document processing ecosystem
- Plugin/Strategy architecture for providers (describe interface → implementations → factory for both services)
- Asymmetric E5 prefix detail
- Architecture diagram with AWS icons (embedded image)
- Source: `ARCHITECTURE.md`, `DECISIONS.md` (ADR-001), `apps/api/src/services/embedding.service.ts`, `apps/api/src/services/llm.service.ts`, `apps/worker/app/services/embeddings.py`

**`docs-site/architecture/data-flow.md`** — Data Flows
- Ingestion flow: detailed sequence diagram (upload → presigned POST → S3 → SQS → Worker pipeline → vectors)
- Query flow: detailed sequence diagram (question → embed → cosine search → prompt → Claude stream → citation verification → SSE)
- Real-time progress flow: Worker → DB update → PG NOTIFY → API SSE → Browser (with scalability caveat)
- Source: `ARCHITECTURE.md` (has ASCII diagrams — convert to Mermaid sequence diagrams), `docs/context/realtime-progress-spec.md`, `docs/context/api-query-engine-spec.md`

**`docs-site/architecture/technology-stack.md`** — Technology Choices
- Table of every technology with justification for choosing it
- Mention: Pod Identity over IRSA, Gateway API over Ingress, Prisma for API / SQLAlchemy for Worker
- Source: `DECISIONS.md`, `GEMINI.md`

**`docs-site/architecture/cost-optimization.md`** — Cost Optimization
- KEDA scale-to-zero, LocalStack for dev, S3 static hosting, CloudFront caching, RDS Proxy, direct S3 uploads
- Estimated monthly cost table for small-scale deployment (~$185/month excluding Bedrock)

---

#### Section: Design Decisions

**`docs-site/design-decisions/index.md`** — ADR Index
- Table of all ADRs with status and one-line summary
- Read `DECISIONS.md` but VERIFY each ADR against current codebase state
- Add new ADRs not in DECISIONS.md:
  - Pod Identity Association over IRSA
  - Gateway API over Ingress
  - CloudFront as unified entry point (the mixed-content story)
  - Build-once artifact promotion
  - config.js runtime configuration decoupling

**Individual ADR pages** — One per decision, following Context → Decision → Consequences format.
- Source: `DECISIONS.md`, `docs/context/active-decisions.md`, `docs/context/ingestion-flow-decisions.md`

**Critical ADR: `docs-site/design-decisions/cloudfront-api-routing.md`**
- Tell the full story: HTTPS frontend → HTTP API rejection → no domain purchase → CloudFront unified routing

---

#### Section: Challenges & Solutions

> Place this section EARLY in navigation (after Design Decisions). These demonstrate senior-level problem-solving.

**`docs-site/challenges/index.md`** — Overview table

Individual challenge pages (each tells the story: problem → investigation → solution → outcome):

1. **ALB DNS Circular Dependency** — K8s creates ALB (generates DNS), but AWS CloudFront needs that DNS. Deploy K8s first, query via terraform query module, re-run AWS.
2. **CloudFront Mixed-Content Rejection** — Cross-reference the design decision.
3. **ArgoCD Commit Pinning vs Moving Pointers** — config.json with exact SHAs on protected release branches with signed commits.
4. **Terraform Query Module** — Avoiding 60-90s provider downloads in CI by querying remote state directly.
5. **RDS IAM Auth Enablement** — Terraform creates RDS but IAM auth needed SQL commands post-creation. 10-minute token cache.
6. **External Secrets Operator for ECR Tokens** — ArgoCD's built-in credential helper failed → ESO with Pod Identity → hourly token rotation.
7. **Presigned PUT → Presigned POST** — PUT doesn't support policy conditions. Migration to createPresignedPost().
8. **Per-Document SSE → Session-Scoped SSE** — ADR-008 → ADR-017 evolution. N connections → 1.
9. **Confirm-Upload Race Condition** — Worker advances state before browser confirms. Made idempotent.
10. **ECR Repository Naming** — Slash-delimited for Helm + Docker coexistence.
11. **Non-Destructive Selective Checkouts** — Committing one service must not wipe siblings on release branches.
12. **Serialized Git Commits** — Concurrency groups across multiple concurrent workflows.
13. **PG NOTIFY Payload Size** — 8 KB limit, error_message truncated to 500 chars.
14. **First-Time Deployment Bootstrap** — Empty commits after [skip ci] automated commits.

Source: `docs/context/known-risks.md`, `docs/context/ingestion-flow-decisions.md`, `docs/context/completed-work.md` (search for "Fix", "Refactor", "Resolution" entries)

---

#### Section: Database

**`docs-site/database/schema.md`** — ER diagram (Mermaid erDiagram), table descriptions, column details
- Source: `apps/api/prisma/schema.prisma`, `docs/context/database-schema-spec.md`

**`docs-site/database/indexes-constraints.md`** — HNSW index (m=16, ef_construction=64), UNIQUE constraints, FK cascades
- Source: `docs/context/database-schema-spec.md`, schema.prisma

**`docs-site/database/access-patterns.md`** — Common queries: session lookup, batch creation, status polling, vector similarity search, progress updates, orphan cleanup
- Source: `docs/context/database-schema-spec.md`, read service files for actual query patterns

**`docs-site/database/pg-notify-triggers.md`** — Trigger function, session-scoped channels, payload structure
- Factual description with scalability caveat
- Source: `docs/context/realtime-progress-spec.md`, Prisma migrations directory

**`docs-site/database/dual-orm-strategy.md`** — Prisma (API) + SQLAlchemy (Worker) sharing one DB
- Prisma Migrate as schema source of truth, manual SQLAlchemy mirror, sync risk
- Source: `DECISIONS.md` (ADR-009)

---

#### Section: Services

For each service section, read the actual source code files AND the corresponding `docs/context/*-spec.md` files. Create sequence diagrams (Mermaid sequenceDiagram) for every major flow.

**API Service** (`docs-site/services/api/`):
- `overview.md` — Layered architecture, middleware chain, config module, error classes, structured logging
- `session-management.md` — HMAC-SHA256, auto-init, sliding window. Source: `docs/context/session-management-spec.md`
- `document-upload.md` — Batch contract, two-tier validation, presigned POST, confirm-upload idempotency, orphan cleanup. Source: `docs/context/batch-upload-spec.md`, `docs/context/ingestion-flow-decisions.md`
- `realtime-progress.md` — Session-scoped SSE, snapshot/update events, polling fallback. WITH SCALABILITY CAVEAT. Source: `docs/context/realtime-progress-spec.md`
- `query-engine.md` — Embedding, cosine search, prompt construction, citation verification, SSE streaming. Source: `docs/context/api-query-engine-spec.md`
- `swagger-api-docs.md` — OpenAPI, Swagger UI, ENVIRONMENT=dev|prod build arg
- `rds-iam-auth.md` — Token generation, caching, Prisma adapter. Source: `apps/api/src/utils/rds-auth.ts`, `apps/api/src/db.ts`
- `docker-build.md` — Two-stage build, ENVIRONMENT build arg, full vs slim variants, CI matrix strategy

**Worker Service** (`docs-site/services/worker/`):
- `overview.md` — Modular structure, entry point, signal handling
- `sqs-consumer.md` — boto3 polling, message parsing, visibility timeout, DLQ bridge. Source: `docs/context/worker-sqs-consumer-spec.md`
- `extraction-pipeline.md` — S3 download, magic byte validation, PyMuPDF. Source: `docs/context/worker-document-extraction-spec.md`
- `chunking-embedding.md` — Sliding window, provider architecture, E5 prefix. Source: `docs/context/worker-chunking-embedding-spec.md`
- `vector-storage.md` — Upsert, progress checkpointing, checkpoint resume, completion. Source: `docs/context/worker-vector-storage-spec.md`
- `idempotency-resume.md` — Three-mechanism strategy, retry semantics

**Frontend** (`docs-site/services/frontend/`):
- `overview.md` — Next.js App Router, Tailwind CSS v4, Zustand, layout components
- `session-auth-flow.md` — useAuth hook, auto-creation
- `batch-upload-s3.md` — UploadZone, useUpload, s3-uploader.ts (XMLHttpRequest + FormData), confirm-upload. Source: `docs/context/batch-upload-spec.md`
- `realtime-progress.md` — sse-client.ts, useIngestion, 3-second polling fallback, auto-teardown
- `chat-streaming.md` — useQuery hook, ChatInterface, ChatBubble, AbortController
- `citation-system.md` — CitationBadge, SourcePopover, SourceAccordion
- `msw-mock-system.md` — MSW setup, per-endpoint routing toggles, DevToolbar, mock vs API mode
- `runtime-config.md` — config.js pattern, priority chain, CI/CD injection

Source for all frontend pages: `docs/context/frontend-implementation-plan.md`, read actual component/hook files in `apps/frontend/src/`

---

#### Section: Infrastructure

**AWS** (`docs-site/infrastructure/aws/`):
- `overview.md` — All AWS components with descriptions, architecture diagram WITH OFFICIAL AWS ICONS (embedded image)
- `terraform-modules.md` — Each module: inputs, outputs, resources
- `initial-setup.md` — First-time AWS provisioning guide
- Source: Read all files in `infra/terraform/aws/modules/*/`, `docs/context/terraform-infrastructure-spec.md`

**Kubernetes** (`docs-site/infrastructure/kubernetes/`):
- `overview.md` — Diagram with K8s icons showing cluster components
- `secrets-csi-driver.md` — SecretProviderClass, volume mounts, env var sync. Source: `infra/terraform/k8s/manifests/secrets-provider-class.yaml`
- `gateway-api-alb.md` — GatewayClass → Gateway → HTTPRoute → ALB. Source: `infra/terraform/k8s/manifests/`
- `argocd-gitops.md` — ApplicationSet, Matrix generators, Multi-Source (OCI chart + Git values), commit pinning. Include diagram showing how different config.json files point to different commits. Source: `infra/terraform/k8s/manifests/argocd-applicationset.yaml`, `docs/context/helm-gitops-multi-source-spec.md`
- `external-secrets.md` — ESO → Pod Identity → ECR token → ArgoCD secrets. Source: `infra/terraform/k8s/manifests/argocd-ecr-secret.yaml`
- `keda-autoscaling.md` — API: KEDA HTTP Add-on (`InterceptorRoute` + `external-push` scaler). Worker: `aws-sqs-queue` trigger (0→10). Source: `infra/k8s/helm/api/templates/keda.yaml`, `infra/k8s/helm/worker/templates/keda.yaml`
- `helm-charts.md` — API chart resources (Deployment, Service, HTTPRoute, SA, Migration Job, KEDA, TargetGroupConfig). Worker chart resources (Deployment, SA, KEDA). Source: `infra/k8s/helm/*/templates/`

---

#### Section: Security

**`docs-site/security/overview.md`** — Defense-in-depth layering: Session → Transport → Storage → Infrastructure
**`docs-site/security/session-authentication.md`** — HMAC-SHA256, timingSafeEqual, secure cookie flags, sliding window
**`docs-site/security/iam-auth-secrets.md`** — IAM DB Auth, Pod Identity, CSI Driver, ESO
**`docs-site/security/upload-security.md`** — Presigned POST policy, server validation, magic byte validation
**`docs-site/security/tenant-isolation.md`** — Parameterized WHERE clause (NOT RLS), consistent across all queries, FK cascading
**`docs-site/security/cors-policy.md`** — Dynamic reflection (dev) vs strict whitelist (prod), credentials, preflight caching

Source: Read middleware files, `DECISIONS.md` (ADR-006, ADR-018), `docs/context/session-management-spec.md`

---

#### Section: Deployment

**`docs-site/deployment/overview.md`** — Trunk-based development, branching strategy diagram, release strategy (semver tags per concern), release tag alignment requirement, branch protection

**`docs-site/deployment/ci-pipeline.md`** — 🚧 PR → detect changed paths → run unit tests → status check → merge gate. Document as designed.

**`docs-site/deployment/cd-dev.md`** — Push triggers per path. For each workflow: what happens, what's built, how GitOps commit works.
- API builds two variants in parallel (full/slim) via matrix
- Serialized commits via concurrency groups
- Source: `.github/workflows/api-worker-cicd.yml`, `frontend-deploy.yml`, `helm-cicd.yml`, `aws-deploy.yml`, `k8s-deploy.yml`

**`docs-site/deployment/cd-staging-production.md`** — Tag → verify in lower env → promote → approval gate → GitOps commit (2-commit dance for stg/prod). API staging promotes slim variant specifically.
- Include diagram: CI pipeline → promote image → Commit 1 (code+values) → Commit 2 (config.json with target_commit) → ArgoCD detects → deploys
- Source: `.github/workflows/api-worker-cicd.yml`, `docs/context/api-worker-cicd-spec.md`, `docs/context/helm-gitops-multi-source-spec.md`

**`docs-site/deployment/infrastructure-deployment.md`** — Deployment ORDER to prevent errors:
1. AWS infra first
2. K8s infra (creates ALB → DNS)
3. Re-run AWS to update CloudFront with ALB DNS
- First-time bootstrap: empty commits after [skip ci]
- Source: `docs/context/infrastructure-cicd-spec.md`

**`docs-site/deployment/branch-tag-protection.md`** — Release branches protected, CI-only pushes, signed commits (designed)

Source for all deployment pages: `docs/context/infrastructure-cicd-spec.md`, `docs/context/frontend-cicd-spec.md`, `docs/context/api-worker-cicd-spec.md`, `docs/context/helm-gitops-multi-source-spec.md`, read workflow YAML files

---

#### Section: Development

**`docs-site/development/local-setup.md`** — Docker Compose full stack. Source: `docker-compose.yml`, `scripts/localstack-init.sh`
- Note: Local setup is under active maintenance

**`docs-site/development/api-standalone.md`**, **`worker-standalone.md`**, **`frontend-standalone.md`** — Per-service standalone instructions

**`docs-site/development/environment-variables.md`** — CENTRAL REFERENCE TABLE for ALL environment variables across ALL services. Read every `.env.example`, config module, and settings file to compile this.

---

#### Section: Testing

**`docs-site/testing/strategy.md`** — Testing pyramid. Unit tests exist (API: Jest, Worker: pytest). Integration/E2E: 🚧 planned.
**`docs-site/testing/api-tests.md`** — Jest suites, how to run
**`docs-site/testing/worker-tests.md`** — pytest suites, how to run
**`docs-site/testing/infrastructure-parity.md`** — LocalStack, local pgvector, local embedding models, Ollama

---

#### Section: Observability

**`docs-site/observability/overview.md`** — Current: structured logging, health checks, graceful shutdown, cleanup jobs. 🚧 Planned: OpenTelemetry (justify vendor-neutral over AWS lock-in)
**`docs-site/observability/logging.md`** — API JSON logger, Worker structured logger
**`docs-site/observability/health-checks.md`** — GET /health, K8s probes in Helm charts
**`docs-site/observability/monitoring.md`** — DLQ depth, orphan cleanup, KEDA metrics. 🚧 Planned: OTel metrics

---

#### Section: Screenshots

**`docs-site/screenshots/index.md`** — Placeholder page organized by category:
1. Application UI (upload, progress, chat)
2. ArgoCD Dashboard
3. CI/CD Pipeline runs
4. AWS Console
5. Infrastructure diagrams

---

## 7. Source Material References

### Primary Sources (read these first)

| File | Contains |
|------|----------|
| `GEMINI.md` | Project constitution, coding standards, directory structure |
| `ARCHITECTURE.md` | Component boundaries, ingestion flow, query flow, CORS |
| `DECISIONS.md` | All Architecture Decision Records (ADRs) |
| `IMPLEMENTATION_PLAN.md` | Phased roadmap |
| `docs/progress/implementation-status.md` | Task completion status |
| `docs/context/current-state.md` | Current code state and warnings |
| `docs/context/completed-work.md` | Detailed work log with verification records |

### Specification Documents (deep dives per topic)

| File | Topic |
|------|-------|
| `docs/context/database-schema-spec.md` | Schema, indexes, triggers, ER |
| `docs/context/session-management-spec.md` | Auth flow, cookies, security |
| `docs/context/batch-upload-spec.md` | Upload contract, validation |
| `docs/context/realtime-progress-spec.md` | SSE, PG NOTIFY, polling |
| `docs/context/api-query-engine-spec.md` | Similarity search, citations |
| `docs/context/api-specification-spec.md` | OpenAPI/Swagger |
| `docs/context/worker-sqs-consumer-spec.md` | SQS polling, DLQ, shutdown |
| `docs/context/worker-document-extraction-spec.md` | Download, validation, PyMuPDF |
| `docs/context/worker-chunking-embedding-spec.md` | Chunker, embeddings |
| `docs/context/worker-vector-storage-spec.md` | Upsert, checkpoints, resume |
| `docs/context/ingestion-flow-decisions.md` | State machine, flow decisions |
| `docs/context/ingestion-flow-review.md` | Pre-implementation review |
| `docs/context/terraform-infrastructure-spec.md` | AWS/K8s Terraform |
| `docs/context/helm-gitops-multi-source-spec.md` | ArgoCD Multi-Source, ECR |
| `docs/context/infrastructure-cicd-spec.md` | AWS/K8s CI/CD pipelines |
| `docs/context/frontend-cicd-spec.md` | Frontend CI/CD pipeline |
| `docs/context/api-worker-cicd-spec.md` | API/Worker CI/CD pipeline |
| `docs/context/frontend-implementation-plan.md` | Frontend phases |
| `docs/context/active-decisions.md` | Active architectural decisions |
| `docs/context/pending-decisions.md` | Deferred decisions |
| `docs/context/known-risks.md` | Risks and mitigations |

### Code Files (verify details against actual implementation)

Always read the actual source code to verify claims from spec documents. Specs may be outdated. Code is the source of truth.

---

## 8. Implementation Order

Execute in this order to build dependencies correctly:

1. **Set up MkDocs Material & CI/CD** — Encapsulated `docs-site/` package (`docs-site/mkdocs.yml`, `docs-site/requirements.txt`, `docs-site/docs/`), `.github/workflows/docs-deploy.yml`, theme config, navigation structure, directory scaffold
2. **Root `README.md`** — Highest visibility, first impression
3. **App READMEs** — `apps/api/README.md`, `apps/worker/README.md`, `apps/frontend/README.md`
4. **Infra READMEs** — `infra/terraform/aws/README.md`, `infra/terraform/k8s/README.md`, `infra/terraform/query/README.md`
5. **Architecture section** — overview, data flows, technology stack, cost optimization
6. **Design Decisions** — ADR index + individual pages (verify against codebase)
7. **Challenges & Solutions** — All 14 challenge pages
8. **Database section** — Schema, indexes, access patterns, PG NOTIFY, dual ORM
9. **Services section** — API, Worker, Frontend (all sub-pages)
10. **Infrastructure section** — AWS overview, K8s components (all sub-pages)
11. **Security section** — All sub-pages
12. **Deployment section** — CI, CD dev, CD stg/prod, infra ordering, branch protection
13. **Development section** — Local setup, standalone guides, env vars reference
14. **Testing & Observability sections**
15. **Screenshots** — Placeholder page
16. **Architecture diagrams** — Generate AWS icon diagrams (can be done at any point)
17. **Review pass** — Verify all cross-references, diagram accuracy, tone compliance

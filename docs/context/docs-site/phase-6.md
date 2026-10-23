# Context Handover: AI Document Intelligence Platform — Documentation Initiative (Phase 6)

## 1. Task Status Overview
- **Goal**: Implement Phase 6 of `DOCUMENTATION_PLAN.md` — Author comprehensive, production-grade Architecture Decision Records (ADRs) across `docs-site/docs/design-decisions/`:
  - `docs-site/docs/design-decisions/index.md` (ADR Index, Topology & Master Decision Registry)
  - `docs-site/docs/design-decisions/cloudfront-api-routing.md` (ADR-021: CloudFront Unified API Ingress & Mixed-Content Elimination)
  - `docs-site/docs/design-decisions/pod-identity-over-irsa.md` (ADR-019: EKS Pod Identity Associations over IRSA)
  - `docs-site/docs/design-decisions/gateway-api-over-ingress.md` (ADR-020: Kubernetes Gateway API & HTTPRoute over Ingress)
  - `docs-site/docs/design-decisions/polyglot-microservices-split.md` (ADR-001: Node.js Concurrency API & Python Worker Split)
  - `docs-site/docs/design-decisions/dual-orm-strategy.md` (ADR-009: Dual ORM Architecture — Prisma Migrate & SQLAlchemy Declarative)
  - `docs-site/docs/design-decisions/idempotency-checkpoint-resumption.md` (ADR-012: Batch Checkpoint Resumption & Upsert Idempotency)
  - `docs-site/docs/design-decisions/session-scoped-sse.md` (ADR-017: Session-Scoped Real-Time SSE Architecture)
  - `docs-site/docs/design-decisions/immutable-artifact-promotion.md` (ADR-022: Multi-Environment Build-Once Immutable Artifact Promotion)
- **Status (Complete & Verified)**:
  - All 9 ADR pages fully authored following the standard Context -> Decision -> Consequences format.
  - Zero content duplication; concise, scannable Markdown with structured bullet points and comparison matrices.
  - Interactive Mermaid diagrams added across all ADR pages showing architectural topologies, lifecycle sequences, and failure recovery flows.
  - Interactive pan, zoom, reset, and fullscreen controls fully operational on all diagrams via `mkdocs-panzoom-plugin` and `stylesheets/custom.css`.
  - Strict documentation build verified (`docs-site/.venv/bin/mkdocs build --strict -f docs-site/mkdocs.yml`) with 0 errors and 0 warnings.

---

## 2. Artifacts Created & Modified

```text
/
├── docs/
│   └── context/
│       └── docs-site/
│           ├── phase-1.md                    # Phase 1 context (MkDocs scaffold & navigation)
│           ├── phase-2.md                    # Phase 2 context (Root README & AWS architecture diagram)
│           ├── phase-3.md                    # Phase 3 context (Microservice App READMEs)
│           ├── phase-4.md                    # Phase 4 context (Infrastructure Terraform READMEs)
│           ├── phase-5.md                    # Phase 5 context (Core Architecture Deep Dives)
│           └── phase-6.md                    # Phase 6 context (Architecture Decision Records)
└── docs-site/
    ├── mkdocs.yml                            # Updated navigation with all 9 curated ADR deep-dive pages
    └── docs/
        └── design-decisions/
            ├── index.md                      # Master ADR registry (ADR-001 to ADR-023) & Decision Topology
            ├── cloudfront-api-routing.md     # ADR-021: CloudFront unified ingress solving browser mixed-content
            ├── pod-identity-over-irsa.md     # ADR-019: EKS Pod Identity Associations replacing IRSA/OIDC
            ├── gateway-api-over-ingress.md   # ADR-020: Kubernetes Gateway API v1.6.1 + HTTPRoute over legacy Ingress
            ├── polyglot-microservices-split.md # ADR-001: Node.js 24 async I/O + Python 3.11 compute decoupling
            ├── dual-orm-strategy.md          # ADR-009: Prisma Migrate authority + SQLAlchemy declarative mirror
            ├── idempotency-checkpoint-resumption.md # ADR-012: UNIQUE upsert keys + batch checkpoint resumption
            ├── session-scoped-sse.md         # ADR-017: 1 session socket on PG progress_{sessionId} channel
            └── immutable-artifact-promotion.md # ADR-022: Build once in dev, promote identical immutable artifacts
```

---

## 3. Implementation Details by Decision Page

### 3.1 Master Registry & Topology (`index.md`)
- Features an **Architectural Decision Topology** diagram mapping dependencies across Edge, Compute, Data, and Delivery.
- Full catalog of all **23 Architecture Decision Records** (ADR-001 through ADR-023) detailing status, architectural domain, rationale, and consequences.
- Documents the formal ADR lifecycle state machine (`Proposed` -> `Approved` -> `Superseded`).

### 3.2 CloudFront Unified API Ingress (`cloudfront-api-routing.md` — ADR-021)
- Details the **browser mixed-content blocking** problem when serving frontend over CloudFront HTTPS while the internal ALB operates over HTTP.
- Explains the architectural solution: CloudFront path-pattern routing (`/*` to S3, `/api/*` to ALB HTTP origin with `CachingDisabled` policy).
- Visual diagram comparing the rejected dual-domain mixed-content error vs approved unified reverse proxy.
- Highlights zero third-party domain purchase/renewal overhead and automated edge TLS termination.

### 3.3 EKS Pod Identity Associations (`pod-identity-over-irsa.md` — ADR-019)
- Analyzes legacy IRSA friction: cluster-specific IAM OIDC identity providers, brittle string-matching trust policies, and projected service account token plumbing.
- Details native `aws_eks_pod_identity_association` binding service accounts to IAM roles via `pods.eks.amazonaws.com`.
- Sequence diagram illustrating in-pod credential acquisition via the node-level `eks-pod-identity-agent` daemonset.
- Explains cluster-agnostic role portability across ephemeral test, staging, and production environments.

### 3.4 Kubernetes Gateway API & HTTPRoute (`gateway-api-over-ingress.md` — ADR-020)
- Analyzes legacy Kubernetes `Ingress` liabilities: vendor annotation sprawl (`alb.ingress.kubernetes.io/*`), untyped strings, and coupling between operators and developers.
- Implements **Kubernetes Gateway API (v1.6.1)** with AWS Load Balancer Controller (v3.5.0):
  - Operator owns `GatewayClass` (`alb`) and `Gateway` (`api-gateway`).
  - Application Helm chart owns `HTTPRoute` (`api-httproute`) attaching declaratively to the parent Gateway.
- Sequence flow showing direct VPC CNI IP-target routing bypassing `kube-proxy` iptables NAT hops.

### 3.5 Polyglot Microservices Split (`polyglot-microservices-split.md` — ADR-001)
- Addresses the monolithic thread contention dilemma: Python GIL and synchronous C-library file operations starving event loops during heavy PDF parsing.
- Decouples Node.js Express (high-concurrency SSE streaming, non-blocking I/O) from Python (C-native PyMuPDF extraction, vector math).
- Asynchronous decoupling via Amazon S3 multipart direct uploads and Amazon SQS queues.
- Details the dual autoscaling strategy: API scaled on HTTP connection rate via KEDA HTTP Add-on, Worker scaled 0→10 pods via KEDA SQS trigger.

### 3.6 Dual ORM Strategy (`dual-orm-strategy.md` — ADR-009)
- Resolves the multi-language database access problem under the strict **Zero Raw SQL Mandate** (`GEMINI.md`).
- Establishes **Prisma Migrate as the Single Source of Truth**: all DDL migrations, HNSW cosine vector indexes, and triggers declared in `apps/api/prisma/schema.prisma`.
- Python worker uses SQLAlchemy Declarative models strictly mirroring the schema with `pgvector.sqlalchemy.Vector(1024)`.
- Flow diagram illustrating unidirectional schema evolution from Prisma to PostgreSQL to SQLAlchemy.

### 3.7 Idempotent Batch Checkpoint Resumption (`idempotency-checkpoint-resumption.md` — ADR-012)
- Solves re-processing failure modes caused by SQS at-least-once delivery, pod evictions, and spot terminations.
- Three-tier resiliency model:
  1. `UNIQUE (document_id, chunk_index)` on `document_chunks` with `ON CONFLICT DO UPDATE`.
  2. Granular `checkpoint_index` on `processing_jobs` committed every 50 chunks; restarts skip completed batches.
  3. SQS message held unacknowledged during processing (`VisibilityTimeout=600s`); automatic redelivery to surviving pods on worker crash.
- Sequence diagram depicting pod termination mid-document and seamless replacement resumption.

### 3.8 Session-Scoped Real-Time SSE Streams (`session-scoped-sse.md` — ADR-017)
- Supersedes ADR-008 (per-document SSE connections) which caused browser connection pool exhaustion (HTTP/1.1 max 6 connections per host) during 5-file batch uploads.
- Consolidates all progress monitoring into a single session-scoped endpoint: `GET /api/documents/progress`.
- PostgreSQL trigger `notify_progress_channel()` emits on session-isolated channel `progress_{sessionId}`.
- Typed events (`event: snapshot` and `event: update`) provide unambiguous parsing contracts.
- Includes senior engineering scalability caveat on PG NOTIFY connection bounds vs Redis Pub/Sub for hyper-scale multi-tenancy.

### 3.9 Immutable Artifact Promotion Pipeline (`immutable-artifact-promotion.md` — ADR-022)
- Replaces the multi-environment rebuild anti-pattern with strict **Build Once in Dev, Promote to Stg/Prod**:
  - Containers: Built once in `dev` ECR, promoted to `stg` and `prod` ECR via `aws ecr describe-images` verification and re-tagging (API canonically promotes the `slim` production variant).
  - Frontend: Compiled once in `dev`, stored in S3 artifact bucket, promoted with runtime `config.js` injection.
  - Helm Charts: Packaged once as OCI artifact in `dev` ECR (`0.0.0-${SHORT_SHA}`), promoted with semver tags.
- Sequence flow showing fail-fast verification aborting promotion if unverified code is referenced.
- Cuts staging/production deployment duration from 12+ minutes to under 90 seconds.

---

## 4. Next Steps in the Implementation Roadmap

According to `DOCUMENTATION_PLAN.md` (§8 Implementation Order):
- **Step 7 (Phase 7)**: Engineering Challenge Post-Mortems (`docs-site/docs/challenges/`):
  - 14 real-world engineering challenge deep dives detailing the problem statement, investigation, architectural solution, and measurable production outcome.

---

## 5. Verification Commands

```bash
# 1. Strict documentation build verification
docs-site/.venv/bin/mkdocs build --strict -f docs-site/mkdocs.yml

# 2. Local preview server
docs-site/.venv/bin/mkdocs serve -f docs-site/mkdocs.yml
```

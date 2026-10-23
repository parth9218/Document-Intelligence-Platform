---
title: "Technology Stack & Architectural Rationale"
description: "Technical evaluation matrices, architectural trade-offs, and justifications for all core platform primitives."
---

# Technology Stack & Architectural Rationale

Every platform primitive was selected based on strict production criteria: cloud-native operability, zero static credential management, cost-effective autoscaling, and strong multi-tenant security boundaries.

---

## Technical Evaluation Matrices

### 1. Ingress & Workload Identity

| Primitive | Selected Technology | Evaluated Alternatives | Architectural Rationale & Trade-Offs |
| :--- | :--- | :--- | :--- |
| **Ingress Routing** | **Kubernetes Gateway API (v1.6.1)** + AWS Load Balancer Controller (`HTTPRoute`) | Traditional Ingress (`ingress-nginx`, AWS ALB Ingress) | • **Decoupled Governance**: Separates cluster infrastructure (`GatewayClass`, `Gateway`) from developer routing (`HTTPRoute`).<br/>• **Cross-Namespace Routing**: Allows clean multi-service path mapping (`/api/*` to Express) natively without vendor-specific ingress annotations. |
| **Workload IAM Identity** | **EKS Pod Identity Associations** | IAM Roles for Service Accounts (IRSA via OIDC) | • **Simplified Infrastructure**: Binds IAM roles to service accounts directly via the EKS control plane API (`aws_eks_pod_identity_association`).<br/>• **Zero OIDC Overhead**: Eliminates the need to maintain an IAM OpenID Connect (OIDC) identity provider per cluster.<br/>• **AWS Recommended**: Successor standard to IRSA across AWS EKS. |

---

### 2. Microservice Compute & Runtimes

| Primitive | Selected Technology | Evaluated Alternatives | Architectural Rationale & Trade-Offs |
| :--- | :--- | :--- | :--- |
| **API Gateway** | **Node.js 24 / Express (TypeScript)** | Python FastAPI, Go (`gin`/`fiber`), Java Spring | • **Concurrent Streaming**: Event loop handles hundreds of concurrent SSE connections with minimal RAM (~120MB per pod).<br/>• **Strict Typing**: End-to-end typed contracts across controllers, Prisma models, and OpenAPI specifications. |
| **Processing Worker** | **Python 3.11 / Boto3 / PyMuPDF** | Node.js Worker, Go Worker | • **Specialized Extraction**: PyMuPDF (`fitz`) provides C-level performance parsing text and bounding boxes from complex PDFs without JVM overhead.<br/>• **Ecosystem Parity**: Native compatibility with ML embeddings libraries (`sentence-transformers`, `numpy`) for offline dev. |
| **Autoscaling Engine** | **KEDA (Kubernetes Event-driven Autoscaling)** | Standard Kubernetes HPA (CPU / Memory metrics) | • **Scale-to-Zero**: Workers scale from 0 to 10 pods strictly when SQS messages arrive (`aws-sqs-queue`), eliminating idle compute bills.<br/>• **HTTP Concurrency Scaling**: API pods scale dynamically via the KEDA HTTP Add-on based on active connection rate. |

---

### 3. Persistence, Vector Indexing & ORM Strategy

| Primitive | Selected Technology | Evaluated Alternatives | Architectural Rationale & Trade-Offs |
| :--- | :--- | :--- | :--- |
| **Database & Vector Store** | **Amazon RDS PostgreSQL + `pgvector`** | Pinecone, Milvus, Qdrant, Chroma | • **Transactional & Vector ACID**: Eliminates two-phase commit overhead between transactional metadata (`sessions`, `documents`) and vector records.<br/>• **SQL Tenant Isolation**: Direct partitioning via parameterized statements (`WHERE session_id = $1`).<br/>• **HNSW Indexing**: Delivers sub-15ms cosine similarity lookups (`m=16, ef_construction=64`) without managing dedicated third-party SaaS infrastructure. |
| **Polyglot ORM Strategy** | **Prisma (API)** & **SQLAlchemy (Worker)** | Raw SQL statements, single shared ORM | • **Prisma Migrate as Source of Truth**: Unified migrations applied solely via Prisma to ensure deterministic schema evolution.<br/>• **Best-in-Class Ergonomics**: Prisma delivers typed auto-completion in TypeScript; SQLAlchemy declarative models deliver robust connection management in Python. |

---

### 4. Secrets Management & Continuous Delivery

| Primitive | Selected Technology | Evaluated Alternatives | Architectural Rationale & Trade-Offs |
| :--- | :--- | :--- | :--- |
| **Secret Injection** | **AWS Secrets Store CSI Driver** & **External Secrets Operator (ESO)** | Static Kubernetes Secrets, Sealed Secrets, HashiCorp Vault | • **Zero Static Credentials**: RDS connection parameters and Bedrock configurations mounted directly from AWS Secrets Manager.<br/>• **Automated ECR Token Rotation**: ESO uses Pod Identity to invoke `ecr:GetAuthorizationToken` and rotate 12-hour tokens into ArgoCD repository secrets hourly. |
| **Continuous Delivery** | **ArgoCD Multi-Source ApplicationSets** | Flux CD, Jenkins / GitHub Actions Helm Push | • **Immutable OCI Packaging**: Packages Helm charts into private AWS ECR OCI registries (`docintel/{env}/{app}`).<br/>• **Commit-Pinned GitOps**: ApplicationSet Matrix joins immutable OCI charts with environment-specific values pinned to exact git commit SHAs, preventing drift from floating branch pointers. |
| **Frontend Distribution** | **Next.js 16 (Static Export) + S3 / CloudFront** | Containerized Next.js Node.js server in EKS | • **Cost & Scalability**: Static HTML/JS/CSS served via global CDN edge caches with 0 EKS CPU/memory overhead.<br/>• **Runtime Config Decoupling**: `/config.js` generated at deploy time allows promoting the exact same immutable build tarball across `dev`, `stg`, and `prod`. |

---

## Architectural Guardrails & Coding Invariants

1. **No Raw SQL Queries**: All database operations must be executed through Prisma ORM models or parameterized client statements. Vector queries use parameterized `$queryRaw` to prevent SQL injection.
2. **Zero Hardcoded Secrets**: Secrets are never checked into git or baked into container images. Workloads resolve credentials via Pod Identity Associations and Secrets Manager volume mounts.
3. **Artifact Immutability**: Container images, Helm charts, and frontend static assets are compiled strictly once in `dev` and promoted across environments by copying immutable digests—never by rebuilding.

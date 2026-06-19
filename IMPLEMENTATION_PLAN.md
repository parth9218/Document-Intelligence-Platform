# AI Document Intelligence Platform — Master Roadmap

This document maps out the phased execution plan for the platform, ensuring each phase achieves a distinct milestone with clear deliverables.

## Phase 1: Foundation (Database & API Skeleton)
* **Goal**: Setup database schemas, session mechanisms, upload interfaces, and worker frameworks.
* **Tasks**:
  * Task 1.1: Database Schema Creation (Task 101)
  * Task 1.2: Port & Adapt Chunker Logic (Task 102)
  * Task 1.3: Develop Node.js TypeScript API Service (Task 103)
  * Task 1.4: Develop Python Worker Daemon Skeleton (Task 104)
* **Milestone**: API returns presigned S3 URLs and validates signed cookies. Worker polls SQS queue safely.
* **Verification**: API integration checks and local SQS message acknowledgement validation.

## Phase 2: Ingestion Pipeline
* **Goal**: Build file retrieval, malware validation, text extraction, embedding, and storage logic.
* **Tasks**:
  * Task 2.1: Worker Document Extraction (PyMuPDF) (Task 201)
  * Task 2.2: Worker Embedding Generation (Amazon Bedrock) (Task 202)
  * Task 2.3: Worker Vector Storage (pgvector) (Task 203)
* **Milestone**: Dropping a PDF into S3 results in vectors stored in pgvector.
* **Verification**: Assert that `document_chunks` rows match text segments and page numbers.

## Phase 3: Query & Citation Engine
* **Goal**: Chat endpoint matching similarity queries and streaming grounded Claude answers.
* **Tasks**:
  * Task 3.1: API Similarity Search (Task 301)
  * Task 3.2: API Answer Generation & Citations (Task 302)
  * Task 3.3: Frontend Adaptation (Task 303)
* **Milestone**: React SPA queries API and receives streamed answers with page citations.
* **Verification**: Verify that query times are < 2.5s and citation indices are verified against DB records.

## Phase 4: Observability Integration
* **Goal**: Standardize telemetry across Node.js API and Python Worker.
* **Tasks**:
  * Task 4.1: OpenTelemetry Tracing (Task 401)
  * Task 4.2: Prometheus & Loki Aggregation (Task 402)
* **Milestone**: Prometheus scrapes endpoints; Loki streams JSON logs; Grafana details end-to-end trace maps.
* **Verification**: Assert traces capture SQS/Bedrock/RDS calls.

## Phase 5: Cloud Deployment & Platform Hardening
* **Goal**: Terraform provisioning, Helm packaging, ArgoCD GitOps, and KEDA autoscaling.
* **Tasks**:
  * Task 5.1: Terraform Provisioning (Task 501)
  * Task 5.2: Helm Charting (Task 502)
  * Task 5.3: ArgoCD GitOps Integration (Task 503)
  * Task 5.4: KEDA Autoscaling (Task 504)
  * Task 5.5: Security Hardening (NetworkPolicies, Kyverno) (Task 505)
* **Milestone**: Infrastructure is created from zero via Terraform and deployed automatically via GitOps.
* **Verification**: Workers scale down to 0 on empty queue and scale up to 10 replicas under SQS load.

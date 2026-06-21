# AI Document Intelligence Platform — Project Constitution

This document is the authoritative project constitution. Future agents working on this codebase must read this file to understand the architecture, coding standards, and operational guidelines.

## 1. Project Overview & Goals
The objective of this project is to build a production-grade, multi-tenant, cloud-native Retrieval-Augmented Generation (RAG) platform on AWS EKS. It serves as a portfolio piece demonstrating:
* **AWS DevOps Engineer Professional (AWS-DOP)** capabilities (EKS, IAM/IRSA, RDS, SQS, S3, KMS, Secrets Manager, CloudWatch).
* **Certified Kubernetes Administrator (CKA)** skills (Deployments, Ingress, NetworkPolicies, HPA, Pod Security Standards).
* **GitOps workflows** via ArgoCD.
* **Modern cloud-native observability** (Prometheus, Loki, Tempo, OpenTelemetry, Grafana).

## 2. Core Architectural Principles
To prevent architectural drift, the codebase enforces the following:
* **Polyglot Decoupled Services**: The client-facing API is built in Node.js/TypeScript using Express (optimized for fast asynchronous I/O and concurrent SSE streaming sessions), and the background processing worker is a decoupled Python daemon. This demonstrates specialized multi-language services in a microservice topology.
* **SQS Handoff & KEDA Scaling**: S3 event notifications trigger SQS messages. Worker pods poll SQS via boto3 and scale 0-10 dynamically via KEDA.
* **Strict Session Tenancy**: Every query is filtered by the user's cryptographically signed session ID. Access control is verified at the middleware and DB layers.
* **IAM Database Authentication**: Avoid static database credentials in the cluster. Pods use short-lived IAM connection tokens.
* **Static Assets Separation**: The React frontend is compiled statically and served from S3+CloudFront, not run inside the cluster.
* **Local Testing & Simulation (Localstack / pgvector / Local LLMs)**: Local development and testing must support decoupled execution without AWS dependencies. This includes emulating S3/SQS via Localstack, using pgvector locally in a Docker container for complete database parity, and supporting local LLMs (like Ollama or Sentence-Transformers) for text and embedding generation to minimize API billing.

## 3. Repository Directory Structure
* `/apps/frontend/` — Static React client application (Vite, TypeScript, Tailwind).
* `/apps/api/` — TypeScript Express backend service.
* `/apps/worker/` — Python async processing consumer.
* `/infra/terraform/` — Terraform configurations to provision all AWS resources.
* `/infra/k8s/helm/` — Helm charts for deploying the application services.
* `/docs/` — Context recovery (`docs/context/`) and progress logs (`docs/progress/`).
* `/tasks/` — Step-by-step task tracking specifications.

## 4. Coding Standards & Conventions
* **TypeScript**: Enforce strict typing. Do not use `any`. Used for the frontend React and Express API services. Database operations in the Express API must be executed strictly using the **Prisma ORM** (no raw SQL).
* **Python**: Enforce PEP 8 style formatting. Use type hinting. Clean up all DB database resources using context managers. Used for the Python worker daemon. Database operations in the worker must be executed strictly using the **SQLAlchemy ORM** (no raw SQL).
* **Database / SQL**: Do not write raw SQL queries. All database transactions, inserts, updates, and vector similarity queries must be executed strictly via ORM models and parameters.
* **Secrets**: Never commit raw credentials. Use AWS Secrets Manager synced via External Secrets Operator to mount secrets inside Pods.

## 5. Development Workflow for AI Agents
When selecting tasks, follow these operational rules:
1. **Locate Task**: Find the lowest-numbered incomplete task in `/tasks/`.
2. **Context Recovery**: Read `docs/context/current-state.md` and `docs/progress/implementation-status.md` to get context on the work done.
3. **Execute Task**: Create or edit code files. Keep edits restricted to 1-3 files. Avoid changes that modify other services unless specified.
4. **Local Verification**: Execute the verification tests outlined in the task.
5. **Update State**: Update `docs/progress/implementation-status.md` (mark task as complete), `docs/context/current-state.md` (document current code state and warnings), and `docs/context/completed-work.md`. In addition, create or update specification documents in `docs/context/` illustrating what changes were made in the codebase, their architectural/performance/security impact, and use visual diagrams (like Mermaid) where possible to explain relationships.

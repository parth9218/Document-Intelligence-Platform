---
title: "ADR-022: Immutable Artifact Promotion Pipeline"
description: "Enforcing build-once artifact immutability across containers, static assets, and Helm OCI packages from dev to prod."
---

# ADR-022: Immutable Artifact Promotion Pipeline

- **Status**: Approved
- **Date**: 2026-10-11
- **Domain**: CI/CD Pipelines & Release Governance
- **Deciders**: Lead DevOps Engineer (AWS-DOP), Release Platform Architect

---

## Context & Problem Statement

Deploying a multi-service platform across multi-stage cloud environments (`dev` -> `stg` -> `prod`) presents severe drift vulnerabilities when releases are built from source at each stage:

1. **The Rebuild Anti-Pattern**:
   Compiling Docker containers, Next.js static bundles, or Helm packages independently in staging and production violates **artifact immutability**:
   - Upstream base image updates (`node:24-alpine` or `python:3.11-slim`) can alter underlying shared C-libraries between staging and production builds.
   - Minor transitive package resolution differences (`npm install` or `pip install`) can introduce undetected bugs into production that were never present in staging.
   - Compile-time environment variable inlining (e.g., `NEXT_PUBLIC_API_URL`) tightly couples static frontend bundles to a specific environment, forcing rebuilds.

2. **Deployment Latency**:
   Re-running Docker Buildx, TypeScript compilation, Prisma generation, and PyMuPDF dependency installations adds 8–15 minutes of pipeline overhead to every production release.

---

## Architectural Decision

We decided to enforce a strict **"Build Once in Dev, Promote Identical Immutable Artifacts to Stg/Prod"** governance model across all platform layers:

1. **Microservice Containers (`api` & `worker`)**:
   - Containers are built strictly once during commits on `dev` via Docker Buildx with GitHub Actions layer caching.
   - Staging releases verify the container's existence in the Dev ECR repository (`aws ecr describe-images`), pull the exact tested image, retag with the semver release tag, and push directly to Staging ECR (`docintel/stg/{app}:{semver}`).
   - For the API, the workflow compiles dual variants in dev: `full` (`${SHORT_SHA}`) and `slim` (`${SHORT_SHA}-slim`), and canonically promotes the hardened `slim` variant to higher environments.
   - Production releases verify and promote the exact container image from Staging ECR to Production ECR with **zero re-compilation**.

2. **Frontend Static Assets (`apps/frontend/`)**:
   - Next.js static HTML/JS bundles are compiled once in `dev` via `npm run build` (`output: 'export'`).
   - Packaged into an immutable `.tar.gz` archive and uploaded to a central S3 artifact bucket (`vars.ARTIFACT_BUCKET_NAME`).
   - Staging and production workflows download the exact tarball, unpack it into the environment S3 bucket, and inject an un-hashed runtime `/config.js` script containing environment-specific API URLs.

3. **Helm Charts (`infra/k8s/helm/`)**:
   - Helm charts are linted and packaged once in `dev` with dynamic version `0.0.0-${SHORT_SHA}` and pushed to Dev ECR as OCI artifacts.
   - Promoted to Staging and Production ECR registries via OCI pull, repack with semver, and push, without altering `Chart.yaml` on disk.

---

## Multi-Environment Promotion Lifecycle

```mermaid
flowchart TD
    subgraph DevEnvironment ["Development (Trunk: dev) — BUILD ONCE"]
        direction TB
        Commit["Push to dev / Dispatch"] --> DevBuild["Docker Buildx & npm build"]
        DevBuild --> DevECR["Dev AWS ECR<br/>docintel/dev/{app}:${SHORT_SHA}"]
        DevBuild --> S3Art["S3 Artifact Bucket<br/>frontend-${SHORT_SHA}.tar.gz"]
        DevBuild --> HelmDev["Dev Helm OCI<br/>0.0.0-${SHORT_SHA}"]
    end

    subgraph StagingEnvironment ["Staging (Tag: stg-*) — PROMOTE & VERIFY"]
        direction TB
        StgTag["Release Tag stg-v*"] --> StgVerify["Fail-Fast Verification<br/>(aws ecr describe-images)"]
        DevECR -.->|Verify & Pull| StgVerify
        StgVerify --> StgApproval{Manual Approval Gate}
        StgApproval -->|Promote Image| StgECR["Staging AWS ECR<br/>docintel/stg/{app}:${SEMVER}"]
        S3Art -.->|Deploy Immutable Bundle| StgS3["Staging S3 Bucket<br/>(Inject stg config.js)"]
    end

    subgraph ProductionEnvironment ["Production (Tag: prod-*) — PROMOTE IDENTICAL"]
        direction TB
        ProdTag["Release Tag prod-v*"] --> ProdVerify["Fail-Fast Verification<br/>(Assert tested in Stg ECR)"]
        StgECR -.->|Verify & Pull| ProdVerify
        ProdVerify --> ProdApproval{Production Approval Gate}
        ProdApproval -->|Copy Exact Image| ProdECR["Production AWS ECR<br/>docintel/prod/{app}:${SEMVER}"]
        S3Art -.->|Deploy Exact Bundle| ProdS3["Production S3 Bucket<br/>(Inject prod config.js)"]
    end

    DevECR --> StagingEnvironment
    StagingEnvironment --> ProductionEnvironment
```

---

## Promotion Verification Matrix

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Tech Lead
    participant GHA as GitHub Actions Pipeline
    participant ECR_Dev as Dev ECR Repository
    participant ECR_Stg as Staging ECR Repository
    participant GitOps as ArgoCD Tracking Branch (stg/app)

    Dev->>GHA: Push Release Tag: stg-api-v1.2.0
    GHA->>ECR_Dev: aws ecr describe-images (Query SHORT_SHA-slim)
    alt Image Missing in Lower Environment
        ECR_Dev-->>GHA: ImageNotFound
        GHA-->>Dev: FAIL-FAST ABORT (exit 1) — Unverified code cannot be promoted
    else Image Verified
        ECR_Dev-->>GHA: Image Manifest Confirmed
        GHA->>GHA: Pause for GitHub Environment Manual Approval
        Dev->>GHA: Reviewer Approves Release
        GHA->>ECR_Stg: Retag & Push to docintel/stg/api:1.2.0 (Zero Rebuild)
        GHA->>GitOps: 2-Commit Dance: Update values.yaml & pin config.json SHA
        GitOps-->>GHA: Release Committed & Synced via ArgoCD
    end
```

---

## Consequences & Trade-Offs

### Positive Consequences

- **Guaranteed Parity**: The container image and static assets running in Production are byte-for-byte identical to the artifacts validated in Staging.
- **Fail-Fast Safety**: If a developer tags a release for code that was never built and tested on `dev`, the pipeline aborts immediately during the pre-flight verification step (`aws ecr describe-images`), preventing unverified code deployments.
- **Sub-90-Second Deployments**: Eliminating the build and compilation phase cuts Staging and Production deployment times from over 12 minutes to under 90 seconds.
- **Audit Traceability**: Every production container tag directly maps back to its originating git commit SHA and staging verification record.

### Negative Consequences & Mitigations

- **Storage Utilization in ECR**: Maintaining separate ECR repositories per environment (`dev`, `stg`, `prod`) multiplies stored image tags.
  - *Mitigation*: Terraform lifecycle policies automatically prune untagged images and retain only the last 30 tagged container versions.
- **Strict Release Tag Discipline**: Staging and production release tags must point to commits where the lower-environment pipeline has already executed.
  - *Mitigation*: Detailed in `docs-site/docs/deployment/overview.md` and enforced by automated pipeline verification scripts.

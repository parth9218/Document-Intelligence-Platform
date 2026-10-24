---
title: "API Docker Build & Packaging"
description: "Two-stage Dockerfile architecture, non-root runtime security, and dual dev/prod container variants."
---

# API Docker Build & Packaging

> Two-stage multi-stage containerization, non-root user execution, and dual dev/prod container compilation via GitHub Actions.

---

## Two-Stage Build Pipeline

The API container is compiled using a multi-stage Dockerfile (`apps/api/Dockerfile`) based on **Node.js 24 Alpine**, isolating the TypeScript compilation toolchain from the minimal production runtime.

```mermaid
flowchart TD
    subgraph Stage1 ["Stage 1: Builder (node:24-alpine)"]
        direction TB
        B1["Install wget & openssl"]
        B2["Download RDS CA Bundle (global-bundle.pem)"]
        B3["Install All Dependencies (npm ci)"]
        B4["Generate Prisma Client (prisma generate)"]
        B5["Compile TypeScript (tsc -> dist/)"]
        B6{"Evaluate ARG ENVIRONMENT"}
        B7["dev: Generate OpenAPI JSON & bundle swagger"]
        B8["prod: Uninstall swagger & stub empty spec"]
        B9["Prune Development Dependencies (npm prune --production)"]

        B1 --> B2 --> B3 --> B4 --> B5 --> B6
        B6 -->|dev| B7 --> B9
        B6 -->|prod| B8 --> B9
    end

    subgraph Stage2 ["Stage 2: Runner (node:24-alpine)"]
        direction TB
        R1["Create Non-Root User (UID 1001: appuser)"]
        R2["Copy Production node_modules, dist, prisma, CA bundle"]
        R3["Set Security Context (USER 1001)"]
        R4["Expose Port 3000 & Execute (npm start)"]
        
        R1 --> R2 --> R3 --> R4
    end

    Stage1 -->|Clean Production Assets| Stage2
```

---

## Dual Variant Matrix Strategy

The continuous integration pipeline (`.github/workflows/api-worker-cicd.yml`) builds two distinct image variants in parallel for development and higher environments:

| Variant Name | Build Argument | ECR Image Tag | Target Environment | Swagger UI Included |
|:---|:---|:---|:---|:---|
| **Full Image** | `ENVIRONMENT=dev` | `${SHORT_SHA}` | `dev` | Yes (`/api-docs` active) |
| **Slim Image** | `ENVIRONMENT=prod` | `${SHORT_SHA}-slim` | `stg` and `prod` | No (`swagger-ui-express` purged) |

---

## Security & Runtime Hardening

- **Non-Root Execution**: Runs strictly as numeric UID `1001` (`appuser`), preventing container breakout privileges.
- **Minimal Surface**: Development dependencies (`typescript`, `@types/*`, build linters) are stripped prior to stage copy via `npm prune --production`.
- **SSL Truststore**: Bundles the official Amazon RDS global certificate bundle (`global-bundle.pem`) to enforce TLS certificate verification on all database queries.
- **Strict Immutability**: Production never compiles containers. The tested `slim` variant created during the development build is verified and promoted across environments.

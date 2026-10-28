---
title: "API Service Overview"
description: "Layered TypeScript Express architecture, middleware chain, configuration loading, and error handling."
---

# API Service Overview

> High-concurrency TypeScript Express backend serving session authentication, S3 presigned upload dispatching, SSE progress streaming, and grounded RAG query orchestration.

---

## Architectural Role & Responsibilities

The API service (`apps/api`) functions as the edge-facing application gateway running on **Node.js 24 Alpine** within the Amazon EKS cluster. It is optimized for asynchronous, non-blocking I/O operations and long-lived HTTP streaming connections.

```mermaid
flowchart TD
    subgraph Client ["Client Layer"]
        Browser["Next.js Single Page App"]
    end

    subgraph MiddlewareChain ["Global Express Middleware Chain"]
        direction TB
        CORS["CORS Middleware<br/>(Dynamic dev / Strict whitelist prod)"]
        Parser["JSON Body Parser<br/>(express.json default 100KB)"]
        Logger["Structured Request Logger<br/>(JSON in prod / Colorized in dev)"]
        SessionAuth["Session Middleware<br/>(HMAC-SHA256 signature & auto-init)"]
        CORS --> Parser --> Logger --> SessionAuth
    end

    subgraph RoutingControllers ["Routing & Validation Layer"]
        direction TB
        Val["Zod Request Validators"]
        Ctrl["Domain Controllers<br/>(Session, Document, Query)"]
        Val --> Ctrl
    end

    subgraph ServiceLayer ["Core Service Orchestration"]
        direction TB
        DocSvc["Document Service<br/>(S3 Presigned POST & state machine)"]
        ProgSvc["Progress SSE Manager<br/>(Dedicated pgPool listener)"]
        SearchSvc["Search & Vector Service<br/>(Embedding + pgvector query)"]
        LLMSvc["LLM Streaming Service<br/>(Claude 3.5 Sonnet via Bedrock)"]
    end

    subgraph Persistence ["Data & External Services"]
        Prisma["Prisma ORM<br/>(Transaction authority)"]
        RDS[("RDS PostgreSQL 16<br/>+ pgvector")]
        Bedrock["Amazon Bedrock<br/>(Titan V2 / Claude 3.5)"]
        S3["Amazon S3 Bucket"]
    end

    Browser -->|HTTP Requests| CORS
    SessionAuth --> Val
    Ctrl --> ServiceLayer
    DocSvc --> Prisma --> RDS
    DocSvc --> S3
    ProgSvc -->|pgPool LISTEN| RDS
    SearchSvc --> Bedrock
    SearchSvc --> Prisma
    LLMSvc --> Bedrock
```

---

## Layered System Topology

The service strictly enforces separation of concerns across five decoupled tiers:

| Layer | Directory | Primary Responsibility |
|:---|:---|:---|
| **Routes** | `src/routes/` | Mounts HTTP path endpoints, attaches route-specific validators, and maps handler methods. |
| **Validators** | `src/validators/` | Validates incoming payloads before controller entry. |
| **Controllers** | `src/controllers/` | Unpacks request context, coordinates service invocations, and crafts HTTP status codes. |
| **Services** | `src/services/` | Contains all business logic, external SDK calls (S3, Bedrock), and database transactions. |
| **Data Layer** | `src/db.ts` | Houses Prisma ORM Client and standalone `pgPool` connection pools. |

---

## Middleware Execution Chain

Incoming requests traverse an ordered pipeline before reaching route handlers:

1. **CORS Middleware**: Evaluates origin against environment policies. Returns `Access-Control-Allow-Credentials: true` and caches preflight `OPTIONS` requests for 24 hours.
2. **Body Parsers**: Decodes JSON payloads using Express standard defaults (100KB) to prevent buffer exhaustion; file uploads bypass API memory entirely via direct S3 presigned POST.
3. **Structured Request Logger**: Intercepts request metadata, assigns correlation IDs, and logs execution latency.
4. **Session HMAC Middleware**: Validates the cryptographic cookie signature, auto-creates guest sessions if missing, and extends the 24-hour expiration window.
5. **Route Validators**: Blocks malformed requests before service dispatch.
6. **Centralized Error Handler**: Translates thrown business exceptions into RFC-compliant JSON responses with standard error codes.

---

## Production Invariants & Guardrails

- **Prisma ORM & Parameterized Vector SQL**: Standard relational reads, writes, and transactional state changes execute through Prisma ORM models. Because Prisma lacks native pgvector support (`Unsupported("vector(1024)")`), vector similarity searches execute via parameterized `prisma.$queryRaw` tagged templates with strict UUID tenant isolation.
- **Fail-Fast Request Validation**: Payloads failing schema or limit checks are rejected with descriptive HTTP 400/422 responses before invoking database or AWS SDK resources.
- **Graceful Lifecycle Management**: The process captures `SIGTERM` and `SIGINT` signals, closing open HTTP sockets, releasing `pgPool` connections, and disconnecting Prisma cleanly.

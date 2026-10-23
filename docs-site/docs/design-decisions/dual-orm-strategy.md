---
title: "ADR-009: Dual ORM Strategy"
description: "Establishing Prisma Migrate as the single source of truth with mirrored SQLAlchemy models for polyglot database consistency."
---

# ADR-009: Dual ORM Strategy (Prisma & SQLAlchemy)

- **Status**: Approved
- **Date**: 2026-10-09
- **Domain**: Database Architecture & Polyglot Data Access
- **Deciders**: Lead Cloud Architect, Database Administrator

---

## Context & Problem Statement

The platform's decoupled architecture consists of a Node.js Express API and a Python worker daemon accessing the same underlying Amazon RDS PostgreSQL instance with the `pgvector` extension:

- **Express API**: Executes fast session lookups, batch upload initialization transactions, and vector cosine similarity queries (`<=>`).
- **Python Worker**: Executes batch upserts of text chunks and 1024-dimensional embeddings, and checkpoints processing progress.

### The Dual-ORM Challenge

1. **Strict Zero Raw SQL Mandate**:
   The authoritative project constitution (`GEMINI.md`) explicitly prohibits raw SQL statements:
   > *"Do not write raw SQL queries. All database transactions, inserts, updates, and vector similarity queries must be executed strictly via ORM models and parameters."*
2. **Dual Migration Hazard**:
   If both runtimes run independent migration frameworks (e.g., Prisma Migrate in TypeScript and Alembic in Python), migration histories inevitably diverge, resulting in deadlocks, race conditions, and corrupted table constraints.
3. **Ecosystem Specialization**:
   Prisma provides auto-generated TypeScript clients with compile-time type safety for Express, while SQLAlchemy provides battle-tested connection management and native `pgvector` type bindings for Python.

---

## Architectural Decision

We decided to establish a **Dual ORM Architecture** governed by a strict, unidirectional schema lifecycle:

1. **Prisma Migrate as the Single Source of Truth**:
   The Prisma schema file (`apps/api/prisma/schema.prisma`) is the **sole authoritative definition** of the platform's database structure:
   - Defines all 6 relational tables: `sessions`, `documents`, `processing_jobs`, `document_chunks`, `query_logs`, and `audit_log`.
   - Declares foreign key cascades (`onDelete: Cascade`), composite unique constraints (`[document_id, chunk_index]`), and HNSW cosine similarity indexes.
   - All migrations are generated, versioned, and applied exclusively via Prisma CLI (`prisma migrate dev`).

2. **SQLAlchemy Declarative Mirroring in Python**:
   The Python worker defines SQLAlchemy ORM models (`apps/worker/app/models/`) that mirror the Prisma-generated database tables 1:1:
   - Uses `pgvector.sqlalchemy.Vector(1024)` to map dimensional embeddings.
   - Uses PostgreSQL `ON CONFLICT (document_id, chunk_index) DO UPDATE` for atomic, idempotent batch upserts.
3. **Zero Python Database Migrations**:
   The Python worker daemon never creates, drops, or alters database tables. It assumes the schema has already been migrated by the API container or pre-flight deployment job.

---

## Schema Synchronization Lifecycle

```mermaid
flowchart TD
    subgraph AuthorityDomain ["Single Source of Truth (Prisma ORM)"]
        direction TB
        Schema["apps/api/prisma/schema.prisma<br/>Authoritative Schema Definition"]
        Migrate["Prisma CLI (prisma migrate dev)<br/>Generates Versioned Migrations"]
        ClientTS["Prisma Client<br/>Auto-Generated Typed Client"]
        
        Schema --> Migrate
        Migrate --> ClientTS
    end

    subgraph DatabaseLayer ["Database Layer (PostgreSQL + pgvector)"]
        direction TB
        RDS[("Amazon RDS PostgreSQL<br/>Tables, Indexes, Triggers")]
        Migrate -->|Applies DDL Schema| RDS
    end

    subgraph PythonDomain ["Consumer Mirror (SQLAlchemy ORM)"]
        direction TB
        Models["SQLAlchemy Declarative Models<br/>Mirrors Schema & Vector Types"]
        WorkerSession["SQLAlchemy Worker Session<br/>Transactional Context Managers"]
        
        Models --> WorkerSession
        WorkerSession -->|Reads & Writes (Zero DDL)| RDS
    end

    ClientTS -->|Reads & Writes| RDS
```

---

## Data Access Model Comparison

| Operational Dimension | Node.js Express API (`apps/api/`) | Python Worker Daemon (`apps/worker/`) |
| :--- | :--- | :--- |
| **ORM Framework** | **Prisma ORM (v5.x)** with `@prisma/adapter-pg` | **SQLAlchemy (v2.x)** Declarative |
| **Primary Responsibility** | Schema authority, session management, vector search | Bulk extraction, vector embeddings, progress checkpoints |
| **Vector Storage Binding** | Unsupported(`"vector(1024)"`) with Prisma `$queryRaw` | `pgvector.sqlalchemy.Vector(1024)` |
| **Index Strategy** | Declares HNSW cosine similarity index (`m=16`, `ef_construction=64`) | Queries against pre-existing HNSW index |
| **Connection Pooling** | Prisma Client + dedicated `pgPool` for SSE `LISTEN` | SQLAlchemy `QueuePool` with context managers |
| **Migration Authority** | **Sole Authority** (`prisma migrate dev`) | **Zero Authority** (Read/Write Only) |

---

## Consequences & Trade-Offs

### Positive Consequences

- **100% Type Safety in Both Languages**: TypeScript controllers receive auto-generated types from Prisma Client; Python worker handlers receive typed SQLAlchemy model instances.
- **Strict Single Source of Truth**: Eliminates multi-migration race conditions; database schema state is always predictable, versioned in git under `apps/api/prisma/migrations/`.
- **Zero Raw SQL Injections**: All queries utilize parameterized ORM statements or sanitized Prisma tag templates (`Prisma.sql`).
- **Seamless Vector Math Support**: Leverages SQLAlchemy's native vector operators (`cosine_distance`) in Python and Prisma raw tagged queries in TypeScript.

### Negative Consequences & Mitigations

- **Model Drift Risk**: If a developer adds a column in `schema.prisma` but forgets to update `apps/worker/app/models/`, the worker will fail to map the new attribute.
  - *Mitigation*: Both services share unified end-to-end integration test suites (`apps/worker/tests/test_integration.py` and `apps/api/src/tests/documents.test.ts`) executed against real PostgreSQL containers during local CI runs.

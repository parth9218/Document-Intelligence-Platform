---
title: "PostgreSQL NOTIFY & Real-Time Triggers"
description: "Session-scoped notification triggers, payload structures, connection lifecycle, and scalability trade-offs."
---

# PostgreSQL NOTIFY & Real-Time Triggers

> Technical deep dive into push-based ingestion progress streaming via PostgreSQL triggers, session pub/sub routing, and SSE delivery.

---

## Architectural Mechanism Overview

To deliver real-time progress updates to user browsers as documents traverse extraction, chunking, and embedding stages, the platform implements an event-driven **PostgreSQL `LISTEN/NOTIFY`** push pipeline:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as React Client (SSE)
    participant API as Express API (pgPool Client)
    participant RDS as PostgreSQL 16 (Trigger)
    participant Worker as Python Worker Daemon

    Browser->>API: GET /api/documents/progress (Establish SSE)
    API->>RDS: LISTEN progress_{sessionId} (Dedicated Pool Connection)
    API-->>Browser: event: snapshot (Initial state of all session files)

    loop Every 50-Chunk Batch
        Worker->>RDS: UPDATE processing_jobs (processed_chunks, progress_pct)
        activate RDS
        RDS->>RDS: processing_jobs_notify trigger fires
        RDS-->>API: NOTIFY progress_{sessionId} {JSON Payload}
        deactivate RDS
        API-->>Browser: event: update (Live progress bar update)
    end

    Note over Browser,API: Client disconnects or closes tab
    Browser-xAPI: Socket Close
    API->>RDS: UNLISTEN progress_{sessionId}
    API->>API: Release pgPool client back to pool
```

---

## 1. Database Trigger Mechanism

The real-time notification engine relies on a database-level trigger bound to the `processing_jobs` table:

- **Trigger Event**: Executes on `AFTER UPDATE` for every row modified in `processing_jobs`.
- **Execution Hook**: Calls the PL/pgSQL function `notify_progress_channel()`.
- **Non-Blocking Execution**: PostgreSQL executes `pg_notify` within the transaction boundary. The notification is committed to connected listeners immediately upon transaction commit.

---

## 2. Session-Scoped Channel Routing

### The Cross-Tenant Noise Problem (ADR-008)

In early architecture drafts, notifications were broadcast to a single global channel (`progress_channel`). This required the Express API to ingest every database event across all platform tenants, inspect payloads, and filter out events belonging to other users, creating unnecessary CPU overhead and potential data leakage risks.

### The Session-Scoped Solution (ADR-017)

The trigger function dynamically targets a channel uniquely derived from the active session UUID:

$$\text{Channel Name} = \text{"progress\_"} + \text{replace}(\text{session\_id}, \text{"-"}, \text{"\_"})$$

- **Identifier Sanitization**: Hyphens in the UUID are replaced with underscores (for example, `progress_550e8400_e29b_41d4_a716_446655440000`) producing a standard PostgreSQL identifier.
- **Kernel-Level Tenant Isolation**: PostgreSQL delivers notifications **only to the backend connection listening on that specific channel**. Express API instances perform zero cross-tenant event filtering.

---

## 3. Payload Structure & 8KB Limit Mitigation

PostgreSQL enforces a strict **8,000-byte payload limit** on `pg_notify` messages. Payloads exceeding this limit cause silent notification dropouts without transaction rollbacks.

### Notification Payload Schema

| Field | Data Type | Description | Optimization Guardrail |
| :--- | :--- | :--- | :--- |
| `document_id` | `UUID` | Target document identifier | Relates the update to client-side document registry. |
| `status` | `String` | Current pipeline stage | Status enum (`extracting`, `embedding`, `completed`). |
| `progress_pct` | `Integer` | Computed progress percentage | Normalized value between 0% and 100%. |
| `processed_chunks` | `Integer` | Total chunks processed so far | Granular counter incremented in batches of 50. |
| `total_chunks` | `Integer` | Total chunks identified | Set during initial extraction phase. |
| `error_code` | `String` | Machine-readable error code | Populated only on failure states. |
| `error_message` | `String` | Diagnostic error summary | **Truncated to 500 characters** in SQL to prevent payload overflow. |

### Payload Size Optimization Invariants

1. **Deterministic String Truncation**: Extraction exceptions and stack traces are truncated to 500 characters using `LEFT(NEW.error_message, 500)` before payload generation. Full stack traces remain safely stored in the `processing_jobs.error_message` column.
2. **Channel-Encoded Session Context**: Because the session UUID is already encoded in the channel name, it is omitted from the JSON body, saving ~20% of the payload frame size.
3. **Metadata Enrichment**: Static attributes (`filename`, `file_size_bytes`) are omitted from the trigger payload; the Express API enriches the SSE stream using cached connection snapshot data.

---

## 4. Connection Pool Lifecycle & Fallback Polling

### Express `pgPool` Connection Management

- **Dedicated Connection**: Each active browser SSE client (`GET /api/documents/progress`) reserves one dedicated connection from Express's `pgPool` instance to execute `LISTEN progress_{sessionId}`.
- **Initial State Synchronization**: Upon connecting, the API immediately executes a snapshot query returning the current status of all session documents as an `event: snapshot` frame.
- **Graceful Teardown**: When the browser disconnects (`req.on('close')`), the API executes `UNLISTEN progress_{sessionId}` and releases the client back to the pool, preventing connection exhaustion.

### 3-Second Fallback Polling Loop

If corporate firewalls or transient network issues terminate the persistent HTTP/1.1 SSE stream:
- The React client detects socket closure within 3 seconds.
- Automatically initiates polling against `GET /api/documents/status` on a 3-second interval.
- Seamlessly terminates the polling loop when the SSE connection is re-established.

---

## 5. Architectural Scalability Caveats

While PostgreSQL `LISTEN/NOTIFY` provides a lightweight real-time event system without requiring external message brokers for current workloads, senior cloud architecture demands acknowledging its scaling boundaries:

| Architectural Factor | Current PostgreSQL `LISTEN/NOTIFY` | Target Enterprise Evolution (Redis Pub/Sub) |
| :--- | :--- | :--- |
| **Connection Overhead** | Requires 1 dedicated PostgreSQL connection per active SSE client. | Redis multiplexes tens of thousands of subscribers over a single connection pool. |
| **RDS Proxy Incompatibility** | Long-held persistent `LISTEN` sockets pin connections and disrupt RDS Proxy connection multiplexing. | API pods bypass database proxies entirely for real-time pub/sub. |
| **Target Scale** | Optimal for designed platform volume (100–500 concurrent active browser sessions). | Required when scaling to 10,000+ simultaneous connected streaming clients. |

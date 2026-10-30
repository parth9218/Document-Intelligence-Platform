---
title: "Frontend Real-Time Progress Visualizer"
description: "EventSource client wrapper, 3-second polling fallback, and modular processing feed cards."
---

# Frontend Real-Time Progress Visualizer

> Real-time Server-Sent Events monitoring, automated polling failover, lifecycle teardown, and granular stage progress cards.

---

## Real-Time Ingestion Architecture

Once files are uploaded to S3, client-side monitoring switches from byte-level upload progress to the server-side ingestion lifecycle via **Server-Sent Events (SSE)**.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Hook as useIngestion() Hook
    participant SSE as sse-client (EventSource)
    participant API as Express API
    participant Store as Zustand Store
    participant UI as ProcessingFeed & Cards

    Hook->>SSE: connectProgressStream()
    SSE->>API: GET /api/documents/progress (withCredentials: true)

    API-->>SSE: event: snapshot (Array of all documents)
    SSE->>Store: setDocumentRegistry(snapshotData)
    Store-->>UI: Render initial document cards

    loop Active Ingestion Updates
        API-->>SSE: event: update (Single document update)
        SSE->>Store: updateDocumentStatus(docId, updatedFields)
        Store-->>UI: Update stage badge, progress bar, chunk count
    end

    alt Network Interruption / SSE Disconnect
        SSE-->>Hook: onerror event
        Note over Hook: Activate 3-second Fallback Polling Loop
        loop Every 3 Seconds
            Hook->>API: GET /api/documents/status
            API-->>Hook: Return active statuses snapshot
            Hook->>Store: setDocumentRegistry(statusData)
        end
        Note over Hook,SSE: On SSE reconnect, terminate polling loop
    end

    alt All Documents Reach Terminal State (completed/failed/expired)
        Hook->>SSE: disconnect()
        Note over Hook: Close socket & stop polling to save resources
    end
```

---

## EventSource Wrapper (`sse-client.ts`)

Built around standard browser `EventSource` with custom resiliency logic:

- **Credentials Invariant**: Configured with `withCredentials: true` to forward session cookies across origins.
- **Typed Event Listeners**:
    - `snapshot`: Populates or resets the entire Zustand document dictionary upon connection.
    - `update`: Incrementally updates an individual document record in place.
- **Heartbeat & Reconnection**: Standard browser EventSource mechanisms automatically attempt reconnection if network connectivity drops.

---

## Resilient Failover & Lifecycle (`useIngestion`)

Implemented in `src/hooks/useIngestion.ts`:

1. **3-Second Fallback Polling**: If the SSE connection encounters network errors or corporate firewall proxy blocking, the hook immediately activates a 3-second fallback interval calling `GET /api/documents/status`.
2. **Automatic Teardown**: As soon as the SSE connection recovers (`onopen`), the polling loop is destroyed.
3. **Smart Inactive Teardown**: If every document in the session reaches a terminal state (`completed`, `failed`, `expired`, `cancelled`), the hook automatically tears down both the SSE connection and polling intervals to conserve device battery and server connection limits.

---

## Modular Feed & Progress Cards (`ProcessingFeed` & `DocumentCard`)

Ingestion progress is visualized using dedicated UI cards:

- **Lifecycle Stage Badges**: Displays distinct styled badges mapping to active state machine phases (`Downloading`, `Validating`, `Extracting`, `Chunking`, `Embedding`, `Completed`).
- **Granular Sub-Stage Indicators**:
    - During chunking: Displays extracted chunk counters (`"Chunking (4 of 8 chunks)..."`).
    - During embedding: Displays calculated percentage progress bars (`"Embedding (50% complete)..."`).
- **Orphan Ingestion Interceptor**: If a document transitions to `failed` or `expired`, the card renders an amber/red warning glow, presents detailed error diagnostics, and provides **Dismiss** (removes card) and **Retry** (prompts file re-selection) actions.

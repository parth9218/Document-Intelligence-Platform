# Real-Time Progress Ingestion Specification

This document details the architectural design, failover mechanisms, and lifecycle control policies implemented in Task F4.1.

---

## 1. Architectural Design

To monitor document ingestion stages in real-time, the client establishes a Server-Sent Events (SSE) connection using the browser-native `EventSource` API. If the connection fails or drops, it switches to a background polling loop, recovering the SSE connection automatically when the network restores.

```mermaid
flowchart TD
    %% Define States
    Start[Load Dashboard page.tsx] --> Init[useIngestion Hook Mounted]
    Init --> Check{Are there active files or local uploads?}
    
    %% Connection Branch
    Check -->|Yes / Mount| ConnectSSE[Connect to GET /api/documents/progress via EventSource]
    Check -->|No and Initial Snapshot Done| Idle[Disconnect & Enter Idle State]
    
    %% SSE Events
    ConnectSSE -->|snapshot event| SetRegistry[Initialize documentRegistry Zustand]
    ConnectSSE -->|update event| UpdateRegistry[Update single document state in Zustand]
    
    %% Error Fallback
    ConnectSSE -->|Connection Error| Fallback[Trigger Fallback Polling]
    Fallback --> Poll[GET /api/documents/status every 3s]
    Poll --> UpdateRegistry2[Batch update documentRegistry Zustand]
    
    %% Recovery
    Poll -->|EventSource onopen triggers| TerminatePoll[Stop Polling Loop]
    TerminatePoll --> ConnectSSE
    
    %% Lifecycle
    UpdateRegistry --> CheckTerminal{All documents terminal & no local uploads?}
    UpdateRegistry2 --> CheckTerminal
    CheckTerminal -->|Yes| Idle
    CheckTerminal -->|No| Maintain[Maintain Active Connection]
```

---

## 2. Named Event Routing

The client connects to `GET /api/documents/progress` with credentials enabled to match the current signed session. It registers event listeners for two named event channels:

1. **`snapshot` Channel**:
   - Sent by the backend immediately upon client connection.
   - Emits a JSON array of all existing documents associated with the session.
   - The hook initializes `documentRegistry` with this array.

2. **`update` Channel**:
   - Sent by the backend trigger whenever a database record changes (using PostgreSQL `LISTEN/NOTIFY` progress channels).
   - Emits a single JSON object containing the updated fields of a processing document.
   - The hook updates the specific record in the Zustand store by ID, ensuring visual updates are synchronized within milliseconds.

---

## 3. Fallback Polling Loop

To maintain robustness against unstable networks, firewalls blocking long-lived HTTP streams, or server restarts, a failover mechanism is built-in:

- **Trigger**: An `onerror` event on the EventSource object indicates connection loss.
- **Action**: The hook switches to polling mode, querying `GET /api/documents/status` every 3 seconds to fetch the complete batch status.
- **Recovery**: The browser native `EventSource` automatically retries connection in the background. When it successfully connects, the `onopen` listener triggers, immediately terminating the polling loop to conserve server resources and network bandwidth.

---

## 4. Lifecycle Controls (HTTP/1.1 Socket Preservation)

Browsers restrict parallel connections to the same host (typically capped at 6 concurrent connections under HTTP/1.1). If multiple tabs keep long-lived SSE connections open, the socket pool is easily exhausted, causing page blocks.

To prevent this connection starvation:
- **Tear-Down**: The `useIngestion` hook monitors active background processes and local upload queues. Once all documents in the registry are in terminal states (`completed`, `failed`, `expired`) and no local uploads are active, the effect runs its cleanup: closing the `EventSource` connection and terminating any active polling loops.
- **Wake-Up**: If the user drops new files, `localProgressQueue` transitions to having active items, resetting `shouldConnect` to `true`. The hook instantly establishes a new `EventSource` connection to capture subsequent updates.

---

## 5. UI Ingestion Feed & Card Components

To translate real-time state changes into visual indicators, the frontend refactors the dashboard's document list into two specialized UI components:

### Processing Feed Container (`processing-feed.tsx`)
- Maps local uploads (files writing directly to S3) and database-tracked documents into a single unified scrolling list.
- Dynamically reads the Zustand store's `localProgressQueue` and `documentRegistry` states to ensure render cycles are synchronized instantly upon state updates.

### Document Status Card (`document-card.tsx`)
- Represents a single document's processing record.
- **Stage Tagging**: Renders colored labels mapping directly to the ingestion state machine (Downloading, Validating, Extracting, Chunking, Embedding, Completed, etc.).
- **Sub-stage Progress Details**: For granular stages, custom sub-messages are rendered dynamically:
  - `chunking`: displays progress based on `processedChunks` and `totalChunks` (e.g. "Chunking (4 of 8 chunks)...").
  - `embedding`: displays progress percentages (e.g. "Embedding (50% complete)...").
- **Orphan Ingestion Interceptor**: 
  - If a document's status is updated to `failed`, `expired`, or `cancelled` (for example, if flagged by the SQS failure daemon or API orphan cleanup job), the card applies an amber/red border warning glow.
  - Displays the detailed backend error message and code.
  - Renders action buttons:
    - **Dismiss**: Invokes `removeDocument(id)` to delete the failed card from the Zustand store.
    - **Retry**: Removes the failed card and triggers a user notification explaining how to re-select and drop the file again.

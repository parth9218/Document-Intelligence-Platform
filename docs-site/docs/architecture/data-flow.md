---
title: "End-to-End Data Flows"
description: "Detailed sequence flows for direct S3 upload, async worker ingestion, real-time SSE progress, and grounded RAG query streaming."
---

# End-to-End Data Flows

The platform implements three decoupled, asynchronous data lifecycles to balance high I/O throughput, compute-intensive document extraction, and low-latency grounded retrieval.

---

## 1. Direct S3 Ingestion & Extraction Lifecycle

Files are never proxied through the API server. The browser uploads directly to S3 via presigned POST policies, triggering an event notification chain through Amazon SQS to the Python worker daemon.

```mermaid
sequenceDiagram
    autonumber
    actor User as React Client (Browser)
    participant API as Express API
    participant S3 as Amazon S3
    participant SQS as Amazon SQS
    participant Worker as Python Worker
    participant DB as PostgreSQL (pgvector)

    User->>API: 1. POST /api/documents (file metadata array)
    Note over API: Two-Tier Validation:<br/>• MIME (PDF/TXT) & Size up to 5MB<br/>• Concurrency up to 5 & Quota up to 50MB
    API->>DB: 2. Initialize Document & ProcessingJob (pending_upload)
    API-->>User: 3. Return Presigned POST URLs & Fields
    
    User->>S3: 4. Direct Multipart POST (FormData)
    Note over User,S3: Browser tracks progress (0-100% XHR)
    S3-->>User: 5. 204 No Content (Upload Confirmed)
    
    par Async Event Notification
        S3->>SQS: 6. S3 ObjectCreated Notification
    and Client Status Confirmation
        User->>API: 7. POST /api/documents/confirm-upload
        API->>DB: 8. Update status = uploaded (Idempotent 200 OK)
    end

    Worker->>SQS: 9. Boto3 Long Poll (WaitTimeSeconds=20)
    SQS-->>Worker: 10. S3 Event Message Payload
    Worker->>DB: 11. Update status = downloading
    Worker->>S3: 12. GET Object (Stream Bytes)
    
    Note over Worker: Extraction Pipeline:<br/>• Validate Magic Bytes (%PDF)<br/>• PyMuPDF text extraction<br/>• Paragraph chunking (~500 tokens)
    Worker->>DB: 13. Update status = extracting to chunking

    loop Every Batch of 50 Chunks
        Worker->>Worker: 14. Embed Chunks (Titan V2 1024-dim)
        Worker->>DB: 15. Upsert Chunks (ON CONFLICT DO UPDATE)
        Worker->>DB: 16. Update checkpoint_index & progress_pct
    end

    Worker->>DB: 17. Atomically set status = completed (100%)
    Worker->>SQS: 18. Delete Message (Job Acknowledged)
```

### Key Ingestion Invariants
- **Presigned POST vs PUT**: Uses AWS SDK v3 `createPresignedPost()` to embed strict infrastructure-level policy conditions (`content-length-range` [1B, 5MB] and `Content-Type`), preventing unauthorized storage tampering at S3.
- **Confirm-Upload Idempotency**: If the SQS consumer picks up the message and transitions the job to `downloading` before the client's `confirm-upload` HTTP call arrives, the API logs the event and safely returns `200 OK` rather than a `409 Conflict`.
- **Checkpoint Resumption**: Batch upserts commit to `document_chunks` using `ON CONFLICT (document_id, chunk_index) DO UPDATE`. If a worker crashes mid-document, the replacement worker resumes from `checkpoint_index + 1`.

---

## 2. Real-Time Progress Notification Lifecycle

Real-time processing updates are pushed to the frontend via a single session-scoped Server-Sent Events (SSE) stream backed by PostgreSQL `LISTEN/NOTIFY`.

```mermaid
sequenceDiagram
    autonumber
    actor Browser as React Client
    participant Express as Express SSE Endpoint
    participant DB as PostgreSQL
    participant Worker as Python Worker

    Browser->>Express: 1. GET /api/documents/progress (Cookie Auth)
    Express->>DB: 2. Query initial document states for session
    Express-->>Browser: 3. SSE event: snapshot (Array of all active documents)
    Express->>DB: 4. LISTEN progress_session_id

    loop Per 50-Chunk Batch
        Worker->>DB: 5. UPDATE processing_jobs (processed_chunks, progress_pct)
        Note over DB: Trigger notify_progress_channel() fires:<br/>NOTIFY progress_session_id, payload
        DB-->>Express: 6. PG NOTIFY payload delivered to listener
        Express-->>Browser: 7. SSE event: update (Single DocumentStatusObject)
    end

    Worker->>DB: 8. UPDATE processing_jobs status = completed, progress_pct = 100
    DB-->>Express: 9. PG NOTIFY completion frame
    Express-->>Browser: 10. SSE event: update (status = completed)
    
    opt Fallback Polling (Network Disconnect)
        Browser->>Express: GET /api/documents/status (Every 3 seconds)
        Express-->>Browser: HTTP 200 JSON (Identical schema to snapshot)
    end
```

### Architectural Scalability Caveat
- **Current Topology**: PostgreSQL `LISTEN/NOTIFY` routes events directly to session-scoped channels (`progress_{sessionId}`) with zero Express-side filtering overhead.
- **Enterprise Trade-off**: Maintaining persistent database connections for SSE listeners consumes database connection headroom. For massive enterprise multi-tenancy (>10,000 concurrent sessions), a dedicated distributed pub/sub broker (such as Redis Pub/Sub) would decouple the database listener pool from the client-facing API tier.

---

## 3. Grounded RAG Retrieval & Streaming Answer Lifecycle

The query engine implements a strict Retrieval-Augmented Generation loop that verifies citations inline to prevent hallucinated references.

```mermaid
sequenceDiagram
    autonumber
    actor Client as React Client (Chat UI)
    participant API as Express API
    participant BedrockEmbed as Titan Embeddings V2
    participant DB as PostgreSQL (pgvector)
    participant BedrockClaude as Claude 3.5 Sonnet
    participant Validator as CitationValidator

    Client->>API: 1. POST /api/query/search (query, stream: true)
    API->>BedrockEmbed: 2. Embed user question
    BedrockEmbed-->>API: 3. Return 1024-dimension float array
    
    API->>DB: 4. Cosine similarity vector query scoped by session_id
    Note over DB: Enforces strict session isolation:<br/>WHERE session_id = current_session<br/>AND cosine_distance at most 0.5<br/>LIMIT 5
    DB-->>API: 5. Top-K relevant context chunks with page numbers

    API-->>Client: 6. SSE event: context (Retrieved source documents & snippets)
    
    API->>BedrockClaude: 7. InvokeModelWithResponseStream (System Prompt + Numbered Context [1]..[n])
    
    loop Real-Time Token Generation
        BedrockClaude-->>API: 8. Streaming text delta tokens
        API->>Validator: 9. Scan for inline bracket citations [n]
        alt Valid Citation (index between 1 and Top-K)
            Validator-->>API: Pass citation token + source metadata
            API-->>Client: 10. SSE event: token (Text delta)
            API-->>Client: 11. SSE event: citation (index, filename, pageNumber)
        else Hallucinated Citation (index exceeds Top-K)
            Validator-->>API: Strip hallucinated bracket reference
            API-->>Client: 12. SSE event: token (Cleaned text without hallucination)
        end
    end

    API-->>Client: 13. SSE event: done
```

### Grounding & Citation Validation Rules
1. **Numbered Context Injection**: Chunks are provided to Claude using sequential bracket indices: `[1] (Source: doc_a.pdf, Page: 4): "..."`.
2. **Deterministic Validation**: The `CitationValidator` uses regex matching (`/\[(\d+)\]/g`) against incoming text streams. Any referenced index greater than the number of retrieved context snippets is stripped before reaching the client.
3. **Interactive Popover UI**: The client parses verified `[n]` bracket badges into interactive hover/click cards displaying the exact page number, document name, and text excerpt.

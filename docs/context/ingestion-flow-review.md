# Document Ingestion Flow — Pre-Implementation Review

This document reviews the proposed ingestion pipeline for correctness, completeness, schema implications, operational concerns, and idempotency before any code is written.

---

## ❌ Corrections to the Proposed Flow

### 1. Pre-signed URL Timing — Option B is Correct

> Section 2 asks: generate URLs before or after file selection?

**Option A (before file selection) is wrong.** A pre-signed URL is bound to an exact S3 object key at signing time. Generating it before the user has selected a file means you cannot embed the correct filename or content-type constraint into the signature.

**Recommendation: Option B — generate after file selection.**

Each file selected triggers one API call:
1. Frontend receives file metadata (name, size, type).
2. Frontend calls `POST /api/documents` with `{ filename, size, mimeType }`.
3. API creates one `documents` row + one `processing_jobs` row and returns one presigned PUT URL.
4. Multi-file upload = multiple sequential or parallel API calls, one per file.

This has the important benefit that each document record is created in isolation — failures on one file do not affect others.

---

### 3. S3 → SQS: No Lambda Intermediary Needed

> Section 3 asks: is a Lambda between S3 and SQS necessary?

**No.** S3 Event Notifications support direct delivery to SQS. Lambda adds latency, a cold start failure mode, additional IAM trust policies, and billable invocations for no benefit at this scale.

**Correct topology:**
```
S3 (s3:ObjectCreated:Put)
  → S3 Event Notification (direct, no Lambda)
  → SQS Standard Queue
  → Python Worker (boto3 long poll)
```

**The only scenario that justifies Lambda** is if you need to fan out to multiple targets (e.g., SQS + SNS + another bucket trigger). That is not the case here.

**One important constraint:** S3 Event Notifications to SQS require the SQS queue policy to explicitly allow `s3.amazonaws.com` as a principal to call `sqs:SendMessage`. This is a Terraform configuration detail, not an architectural blocker.

---

## ✅ State Machine Design

### Recommended Unified Status Enum

Tracking state in two places (`documents.status` and `processing_jobs.status`) creates synchronization risk. The canonical source of truth should be **`processing_jobs.status`**, with `documents.status` being a materialized summary (see schema section below).

```
pending_upload    ← API created the record, presigned URL issued
uploaded          ← Browser successfully uploaded to S3 and called confirm-upload API
downloading       ← Worker picked up SQS message and is fetching the S3 object
validating        ← Worker is sniffing magic bytes, checking MIME
extracting        ← Worker is parsing text via PyMuPDF
chunking          ← Worker is splitting into paragraph chunks
embedding         ← Worker is generating and persisting vectors (with %)
completed         ← All chunks embedded; document is queryable
failed            ← Unrecoverable error at any stage (error_message stored)
cancelled         ← User or system cancelled before completion
expired           ← presigned URL TTL elapsed, never uploaded
```

> **Architectural implication:** The `uploaded` transition requires an explicit API endpoint — `POST /api/documents/:id/confirm-upload` — that the browser calls immediately after receiving a `200 OK` from S3. Without this endpoint, the backend has no mechanism to write `status = 'uploaded'`; the SQS-triggered worker only knows to begin processing, which skips this status entirely.
>
> This introduces a new failure gap: if the browser reports upload complete (calling confirm-upload) but the S3 ObjectCreated event is never delivered to SQS (SQS message lost, S3 notification misconfiguration), the document will be stuck in `uploaded` indefinitely — distinct from `expired`. The cleanup job must also handle `uploaded` records with no SQS activity after a timeout window (e.g., 10 minutes).

**Transition rules:**
- `pending_upload` → `uploaded`: triggered by browser calling `POST /api/documents/:id/confirm-upload` after S3 returns `200 OK`
- `uploaded` → `downloading`: triggered by worker picking up the SQS ObjectCreated message
- `uploaded` → `downloading`: worker begins fetch
- Any stage → `failed`: catches exceptions; error_code + error_message stored
- `pending_upload` → `expired`: scheduled cleanup job (TTL ~30 min)
- Any non-terminal stage → `cancelled`: user-initiated cancellation

**Terminal states** (no further transitions): `completed`, `failed`, `cancelled`, `expired`

---

## 📊 Hybrid Progress Model (Option C — Recommended)

Option A (phase-level only) is too coarse. Option B (per-chunk row inserts) generates enormous write amplification — a 5,000-chunk document would produce 5,000 individual status writes, each triggering a PG NOTIFY event. This is unacceptable.

**Option C is the right approach.** The `processing_jobs` table stores aggregate counters, not per-chunk events:

```sql
status            TEXT     -- current stage enum above
total_chunks      INTEGER  -- set when chunking completes
processed_chunks  INTEGER  -- incremented in batch (not per-chunk)
progress_pct      SMALLINT -- computed: (processed_chunks / total_chunks * 100)
checkpoint_index  INTEGER  -- last successfully persisted chunk batch index
```

**Write pattern for the embedding stage:**

```python
BATCH_SIZE = 50  # embed and persist 50 chunks at a time

for batch_index, batch in enumerate(chunk_batches):
    embed_and_persist(batch)
    update_job_progress(
        processed_chunks = (batch_index + 1) * BATCH_SIZE,
        checkpoint_index = batch_index,
        progress_pct = int(((batch_index + 1) / total_batches) * 100)
    )
    # PG trigger fires NOTIFY here → SSE stream delivers one update per batch
```

This means a 5,000-chunk document with batch size 50 produces **100 progress writes** to PG — not 5,000. The SSE stream delivers exactly 100 progress events to the browser. Acceptable.

---

## 🔁 Idempotency Strategy

This is the most critical design concern. SQS delivers messages **at least once** — duplicate processing is guaranteed to occur under failures. Workers must be fully safe to re-run.

### Core Idempotency Rules

**1. Chunk-level deduplication key**

Each `document_chunks` row must have a unique constraint on `(document_id, chunk_index)`. On re-processing, use upsert:

```sql
INSERT INTO document_chunks (document_id, chunk_index, content, page_number, embedding)
VALUES (...)
ON CONFLICT (document_id, chunk_index) DO UPDATE SET
  embedding = EXCLUDED.embedding,
  updated_at = NOW();
```

This makes chunk persistence idempotent regardless of how many times the worker runs.

**2. Checkpoint-based resume from `checkpoint_index`**

On worker startup for a given `document_id`, the worker reads `processing_jobs.checkpoint_index`. It reconstructs the chunk list from the already-extracted text (or re-extracts) and skips to `checkpoint_index + 1` to avoid re-embedding completed batches.

**3. SQS visibility timeout as distributed lock**

When a worker picks up a message, SQS makes it invisible to other workers for the visibility timeout period (recommend: 5–10 minutes per document). This prevents two workers from processing the same document simultaneously. If the worker crashes, visibility timeout expiry returns the message to the queue.

**4. DLQ after 3 attempts → `failed` state**

When SQS moves a message to the DLQ after maxReceiveCount (recommend: 3), a separate process or Lambda must read from the DLQ and update `processing_jobs.status = 'failed'` with an error message. Without this, documents will appear stuck in `downloading` or `embedding` state in the UI indefinitely.

**5. Preventing phantom `pending_upload` records**

Presigned URLs expire. Records created with `status = 'pending_upload'` that never receive an S3 event must be cleaned up. Options:
- A scheduled job (cron) that sets `status = 'expired'` for `pending_upload` records older than the URL TTL (e.g., 30 minutes).
- An S3 lifecycle rule to delete orphaned objects that never received processing (belt-and-suspenders).

**6. Re-indexing support**

For future re-embedding (e.g., model upgrade), add a `model_version` column to `document_chunks`. Re-indexing can then delete rows where `model_version != current_version` and re-process, rather than re-processing the entire document.

---

## 🗄️ Recommended Database Schema

```
sessions
  id              UUID PRIMARY KEY
  session_token   TEXT UNIQUE NOT NULL          -- HMAC-signed value stored in cookie
  created_at      TIMESTAMPTZ DEFAULT NOW()
  last_active_at  TIMESTAMPTZ
  expires_at      TIMESTAMPTZ NOT NULL
  ip_address      INET
  user_agent      TEXT

documents
  id              UUID PRIMARY KEY
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
  filename        TEXT NOT NULL
  mime_type       TEXT NOT NULL
  file_size_bytes BIGINT NOT NULL
  s3_key          TEXT NOT NULL UNIQUE          -- sessions/{sid}/documents/{did}/original
  status          TEXT NOT NULL DEFAULT 'pending_upload'  -- materialized from processing_jobs
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()

  INDEX: (session_id)                           -- for session-scoped document listing

processing_jobs
  id                UUID PRIMARY KEY
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  session_id        UUID NOT NULL               -- denormalized for fast tenant-scoped queries
  status            TEXT NOT NULL DEFAULT 'pending_upload'
  total_chunks      INTEGER                     -- NULL until chunking completes
  processed_chunks  INTEGER NOT NULL DEFAULT 0
  progress_pct      SMALLINT NOT NULL DEFAULT 0
  checkpoint_index  INTEGER NOT NULL DEFAULT -1 -- -1 = not started; N = last completed batch
  error_code        TEXT                        -- machine-readable error class
  error_message     TEXT                        -- human-readable detail
  worker_id         TEXT                        -- which worker pod processed this
  started_at        TIMESTAMPTZ
  completed_at      TIMESTAMPTZ
  created_at        TIMESTAMPTZ DEFAULT NOW()
  updated_at        TIMESTAMPTZ DEFAULT NOW()

  UNIQUE: (document_id)                         -- one job per document
  INDEX: (session_id, status)                   -- for session-scoped job listing

document_chunks
  id              UUID PRIMARY KEY
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  session_id      UUID NOT NULL               -- denormalized for tenancy-scoped vector search
  chunk_index     INTEGER NOT NULL            -- sequential position within document
  page_number     INTEGER                     -- source page (NULL for plain text)
  content         TEXT NOT NULL
  token_count     INTEGER
  embedding       vector(1024)                -- Titan Embeddings V2; Prisma: Unsupported("vector(1024)")
  model_version   TEXT NOT NULL DEFAULT 'titan-embed-text-v2'  -- for future re-indexing
  created_at      TIMESTAMPTZ DEFAULT NOW()
  updated_at      TIMESTAMPTZ DEFAULT NOW()

  UNIQUE: (document_id, chunk_index)          -- idempotent upsert key
  INDEX: HNSW (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)
  INDEX: (session_id)                         -- for tenancy-scoped vector search WHERE clause

query_logs
  id              UUID PRIMARY KEY
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
  query_text      TEXT NOT NULL
  query_embedding vector(1024)
  retrieved_chunk_ids UUID[]                  -- which chunks were fetched
  answer_text     TEXT
  latency_ms      INTEGER
  model_version   TEXT
  created_at      TIMESTAMPTZ DEFAULT NOW()

audit_log
  id              UUID PRIMARY KEY
  session_id      UUID
  event_type      TEXT NOT NULL               -- 'document_uploaded', 'query_made', 'session_created', etc.
  entity_id       UUID                        -- the relevant document/query/session id
  metadata        JSONB
  created_at      TIMESTAMPTZ DEFAULT NOW()
```

### PG NOTIFY Trigger

The SSE progress mechanism depends on a trigger firing on `processing_jobs` updates:

```sql
CREATE OR REPLACE FUNCTION notify_progress_channel()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'progress_channel',
    json_build_object(
      'document_id', NEW.document_id,
      'status', NEW.status,
      'progress_pct', NEW.progress_pct,
      'processed_chunks', NEW.processed_chunks,
      'total_chunks', NEW.total_chunks,
      'error_message', NEW.error_message
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER processing_jobs_notify
AFTER UPDATE ON processing_jobs
FOR EACH ROW EXECUTE FUNCTION notify_progress_channel();
```

The Express API `LISTEN`s to `progress_channel` and routes NOTIFY payloads to the correct SSE connection by matching `document_id`.

---

## ⚠️ Missing Steps in the Proposed Flow

### 1. Magic Number / MIME Validation (After Download, Before Extraction)

Not mentioned in the user's flow. The worker must validate the file type by inspecting file magic bytes after downloading from S3 — not by trusting the `Content-Type` header, which can be spoofed. If validation fails → set status to `failed` with `error_code = 'invalid_file_type'`.

### 2. S3 Upload Confirmation Ambiguity

The proposed flow assumes S3 → SQS event is the only signal of upload success. This creates a gap: what if S3 delivers the event but the SQS message is lost? The worker must treat the S3 key as the authoritative source and verify the object actually exists before processing.

### 3. Presigned URL Content-Type Enforcement

The presigned URL generated by the API should include a `Content-Type` condition and a size limit in the policy:
```
Conditions: [
  ["content-length-range", 1, 5242880],  // 1 byte to 5 MB 🔴 Updated from 25 MB (see ADR-013)
  {"content-type": "application/pdf"}     // or text/plain
]
```
Without this, a client could upload an arbitrary file type and bypass MIME validation at the API level.

### 4. DLQ → Failed State Bridge

When SQS moves a message to the DLQ, the UI will show the document stuck in its last status (e.g., `downloading`) with no error. A process must bridge DLQ arrivals to `status = 'failed'` updates in the DB. Options: a second worker polling only the DLQ, or a Lambda triggered by DLQ depth alarm.

### 5. Session Expiry During Processing

If a session expires while a document is being processed:
- The session row is deleted (CASCADE deletes documents and chunks).
- The worker holds a reference to a now-deleted document_id.
- The worker must gracefully handle `NoResultFound` / `ForeignKeyViolation` errors and skip the message.

---

## 🔄 Progress Update Architecture — Final Recommendation

**Workers write directly to PostgreSQL.**

```
Worker
  → UPDATE processing_jobs SET status=..., progress_pct=..., checkpoint_index=...
  → PG trigger fires NOTIFY 'progress_{sessionId}'
  → Express API (LISTEN on 'progress_{sessionId}' per connected SSE client)
  → SSE stream → React browser
```

**SSE Endpoint:** `GET /api/documents/progress` (session-scoped). One connection per session. Named events:
- `event: snapshot` — initial frame on connect; JSON array of all session document statuses
- `event: update` — subsequent frames per NOTIFY; single document status object

**Polling Fallback:** `GET /api/documents/status` (session-scoped). Returns `{ "documents": [...] }` matching the snapshot array schema. Polled every 3 seconds on SSE disconnect.

**Why session-scoped PG NOTIFY channels?**

| Option | Pros | Cons |
|--------|------|------|
| Global `progress_channel` + session filter in Express | Simple trigger | Every SSE connection receives all sessions' events; Express discards non-matching ones — O(sessions) waste |
| Session-scoped channel (chosen) | PostgreSQL routes only matching events; zero Express filtering | Trigger uses `replace(session_id::text, '-', '_')` for valid identifier | 
| Redis pub/sub | Very fast | Extra infra, separate failure domain, data can drift from DB |

The **polling fallback** (`GET /api/documents/status`) is the right safety net when the SSE connection drops. It returns the same schema as the `snapshot` event, so frontend parsing logic is shared.

The PG NOTIFY payload limit (8KB) is not a concern — the NOTIFY payload is a small JSON object of progress fields, not chunk content.

**Important caveat:** If the Express API restarts while a user is watching document processing, the SSE connection drops. The React client must detect `EventSource.onclose` and reconnect (which replays the full `snapshot` for all documents) or fall back to polling. This reconnect logic must be explicitly implemented in the frontend (Task 303).

---

## 📋 Summary: Changes to Make Before Implementation

| Priority | Item | Impact |
|----------|------|--------|
| 🔴 Critical | Remove all Celery references; confirm boto3 consumer everywhere | ADR-002 compliance |
| 🔴 Critical | Add `checkpoint_index` and `worker_id` columns to `processing_jobs` | Idempotent resume |
| 🔴 Critical | Add `UNIQUE (document_id, chunk_index)` constraint to `document_chunks` | Idempotent upsert |
| 🔴 Critical | Add `model_version` column to `document_chunks` | Future re-indexing |
| 🟠 High | Define DLQ → `failed` state bridge mechanism | Prevents stuck UI |
| 🟠 High | Add presigned URL content-type conditions in S3 policy | File type security |
| 🟠 High | Add `validating` stage to status enum | Magic byte check visibility |
| 🟠 High | Add `expired` cleanup job spec (cron on `pending_upload` TTL) | Orphan prevention |
| 🟡 Medium | Denormalize `session_id` into `processing_jobs` and `document_chunks` | Avoids join for tenant queries |
| 🟡 Medium | Specify SQS visibility timeout value (recommend: 10 min per doc) | Concurrency safety |
| 🟡 Medium | Specify frontend SSE reconnect behavior on connection drop | Progress resilience |
| 🟢 Low | Define `error_code` enum (machine-readable failure classes) | Observability |
| 🟢 Low | Specify SQS `maxReceiveCount = 3` before DLQ routing | Retry budget |

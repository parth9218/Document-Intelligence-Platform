# AI Document Intelligence Platform — Architecture Specifications

This file details the structural specifications of the platform, outlining boundaries, components, data flows, and real-time synchronization mechanisms.

## 1. Component Boundaries & Responsibilities
* **React SPA (Frontend)**: Served from CloudFront + S3. Responsible for cookie session creation, direct multipart upload to S3 (tracking browser-side upload progress), listening to Server-Sent Events (SSE) for document ingestion status and streaming query answers, and rendering interactive markdown with page citations.
* **API Service (Node.js/TypeScript)**: Express server in Kubernetes. Handles session HMAC signature validation, rate limits, storage quotas, S3 presigned URL generation, Bedrock query embedding, similarity querying against pgvector (using Prisma client), prompt rendering, Bedrock Claude integration, SSE streaming for query responses, and real-time ingestion progress push (via PG LISTEN/NOTIFY or status API polling).
* **Worker Service (Python)**: Standalone boto3 polling script. Receives SQS events, downloads PDFs, Sniffs magic numbers, parses text via PyMuPDF, chunks paragraphs, calls Titan Embeddings V2, commits vectors to Postgres (using SQLAlchemy), and updates granular progress state in the database.
* **Amazon SQS & DLQ**: Intermediate broker for ingestion jobs. DLQ alerts on message depth > 0 after 3 attempts.
* **Amazon RDS PostgreSQL + pgvector + RDS Proxy**: Holds transactional session state, document job logs, and dimensional vector indexes. RDS Proxy pools connections and delegates auth to IAM.

---

## 2. Ingestion & Real-Time Progress Update Flow

To give users transparency during ingestion, the system tracks and updates progress through every stage of processing (Upload -> Queue -> Download -> Extraction -> Chunking -> Embedding -> Vector Storage).

### Architectural Ingestion Flow Diagram
```text
[React Browser]       [Express API]       [Amazon S3]      [Amazon SQS]      [PostgreSQL]      [Python Worker]
       |                     |                 |                |                 |                   |
       |-- 1. POST Upload -->|                 |                |                 |                   |
       |   (Request URL)     |-- 2. Init DB ------------------------------------->| (status =         |
       |                     |      Document & Job Record                         |  'pending_upload')|
       |<- 3. S3 URL & ID ---|                 |                |                 |                   |
       |                     |                 |                |                 |                   |
       |------ 4. PUT File (Direct S3) ------->|                |                 |                   |
       |   (XHR progress: 0-100% upload status)|                |                 |                   |
       |                                       |-- 5. Event --->|                 |                   |
       |                                       |   Notification |                 |                   |
       |-- 5b. POST confirm-upload ----------->|   to SQS       |<- 6. Long Poll -|                   |
       |   (status: uploaded)                  |                |   (Message) ----|                   |
       |<- 5c. 200 OK -------------------------|                |-- 7. Payload ------>|               |
       |                                       |                |                     |               |
       |                                       |                                      |-- 8. Status ->|
       |                                       |                                      |  'downloading'|
       |                                       |<====== 10. SSE Status Updates =======|               |
       |<- 9. SSE updates ("Downloading...") --|  (PG LISTEN/NOTIFY progress_channel) |               |
       |                                       |                                      |               |
       |                                       |<------ 11. GET File (Download) ------|               |
       |                                       |======= 12. File Data ===============>|               |
       |                                       |                                      |               |
       |                                       |                                      |-- 13. Status ->|
       |<- 13b. SSE ("Validating...") ---------|                                      |  'validating' |
       |<- 14. SSE updates ("Extracting...") --|                                      |  'extracting' |
       |                                       |                                      |               |
       |                                       |                                      |-- 15. Chunks ->|
       |<- 16. SSE ("Embedding (30%)...") -----|                                      |  'embedding'  |
       |                                       |                                      |               |
       |                                       |                                      |-- 17. Batch ->|
       |<- 18. SSE ("Embedding (X%)...") ------|                                      |  Insert       |
       |                                       |                                      |  & Progress   |
       |                                       |                                      |               |
       |                                       |                                      |-- 19. Status ->|
       |<- 20. SSE ("Completed (100%)") -------|                                      |  'completed'  |
```

### Detailed Ingestion Progress Mechanism
1. **Upload Progress**: Tracked natively on the browser client via XMLHttpRequests/Fetch upload progress callbacks (since files are uploaded directly from the browser to the S3 bucket via presigned URLs).
2. **State Updates**: The worker performs database transactions on a `processing_jobs` table to checkpoint progress. Statuses transition through: `pending_upload` -> `uploaded` -> `downloading` -> `validating` -> `extracting` -> `chunking` -> `embedding` -> `completed` / `failed`. The `uploaded` transition is triggered by the browser calling `POST /api/documents/:id/confirm-upload` after receiving a `200 OK` from S3 — not by the SQS event. The SQS ObjectCreated event triggers the worker's `downloading` transition.
3. **Synchronous/Asynchronous Propagation**:
   * **SSE Connection (Push Model)**: The API hosts `GET /api/documents/progress` (session-scoped, no document ID). On connect, it sends a `snapshot` SSE event containing the current status of all session documents as a JSON array. PostgreSQL `LISTEN/NOTIFY` (specifically listening to a session-scoped channel `progress_{sessionId}`) then triggers `update` SSE events as the worker updates `processing_jobs` rows. The channel name is derived from the session ID with hyphens replaced by underscores (e.g., `progress_550e8400_e29b_41d4_a716_446655440000`), ensuring PostgreSQL routes events only to the correct listener.
   * **Status Endpoint (Pull Fallback)**: The API implements `GET /api/documents/status` (session-scoped). The frontend can poll this endpoint every 3 seconds to recover status for all documents if the SSE connection drops or is blocked. The response schema is identical to the `snapshot` event data payload for consistent frontend parsing.

---

## 3. Retrieval & Grounded Question-Answering (Q&A) Flow

The Retrieval and Q&A engine implements a strict Retrieval-Augmented Generation (RAG) loop to respond to user questions, verify citations, stream answers via Server-Sent Events, and maintain session multi-tenancy.

### Retrieval & Q&A Flow Diagram
```text
[React Browser]       [Express API]       [Amazon Bedrock (Titan/Claude)]      [PostgreSQL (pgvector)]
       |                     |                           |                                |
       |-- 1. POST Query --->|                           |                                |
       |   (Question &       |                           |                                |
       |    Session Cookie)  |                           |                                |
       |                     |-- 2. Embed Query (Titan) >|                                |
       |                     |<- 3. 1024-dim Vector -----|                                |
       |                     |                           |                                |
       |                     |-- 4. Cosine Search (Scoped strictly by Session ID) ------->|
       |                     |<- 5. Top-5 Relevance-Matched Chunks -----------------------|
       |                     |                           |                                |
       |                     |-- 6. Invoke Claude (Stream, System Prompt + Context) ---->|
       |                     |                           |                                |
       |                     |<== 7. SSE Response Token Stream (Real-Time Output) ========|
       |                     |                           |                                |
       |                     |-- 8. Parse Inline Citations [1]..[n]                       |
       |                     |-- 9. Discard/Flag Hallucinated Citations                   |
       |                     |                           |                                |
       |<- 10. SSE Stream ---|                           |                                |
       |   (Text Tokens &    |                           |                                |
       |    Metadata Bubble) |                           |                                |
```

### Grounded Retrieval & Answer Generation Specifications
1. **Embedding Query**: The API receives the user's question, uses Amazon Bedrock (Titan Embeddings V2 1024-dimension model) to embed the text, and searches PostgreSQL.
2. **Tenancy-Partitioned Similarity Search**: Vector retrieval uses cosine distance (`<=>`) against the `document_chunks` table, strictly limited to the current user's active `session_id` using parameterized queries (or Prisma raw queries) to enforce separation. Chunks are filtered by distance <= 0.5 and the top-5 relevance matches are fetched.
3. **Prompt Engineering & Brackets**: The retrieved chunks are formatted into a system prompt using sequential bracket numbers:
   ```text
   Use the following context snippets to answer the user's question. 
   For any claim you make, you must reference the exact snippet using a bracket citation like [1], [2], etc.
   If the context doesn't contain the answer, state that you do not know. Do not hallucinate.

   Context:
   ---
   [1] (Source: doc_a.pdf, Page: 5): "The platform scales from 0 to 10..."
   [2] (Source: doc_b.pdf, Page: 12): "Sessions expire after 24 hours..."
   ```
4. **Streaming & Citation Verification**:
   * The API invokes Bedrock Claude using SSE.
   * As text streams in, the API scans for bracket patterns (`[1]`, `[2]`). It maps them back to the active context chunks retrieved in step 2.
   * If Claude references a number that was not in the context list (a hallucinated citation), the API filters it out or marks it as unverified to prevent misleading citations.
   * The API streams the text chunks and a citation mapping metadata payload (e.g. `[1]` maps to `doc_a.pdf`, page 5) back to the client.

---

## 4. Strict Tenancy Partitioning
All relational tables maintain a `session_id` column. Cross-session queries must be blocked at the database execution level via parameterized statements:
```sql
SELECT content, page_number FROM document_chunks 
WHERE session_id = $1 AND embedding <=> $2::vector ASC LIMIT 5;
```
Session signatures are verified on every request using an HMAC token stored inside the cookie, preventing IDOR-based access leakage.

---

## 5. Local Testing & Mock Specifications
To reduce cloud costs and enable offline development, the system supports a local testing topology:
* **AWS Mocking (Localstack)**: Core AWS integrations (Amazon S3 and SQS) are replicated locally using `Localstack` via Docker. S3 bucket events and SQS polling use custom local endpoints (e.g. `http://localhost:4566`).
* **Vector Indexing (pgvector)**: A local container running PostgreSQL with the `pgvector` extension provides 100% database parity with production RDS, eliminating the need for separate mock vector databases.
* **Local LLM & Embeddings (Ollama & Offline Transformers)**:
  - **Ollama**: Emulates text generation models locally (e.g., Llama3/Mistral APIs mapped to Bedrock interfaces).
  - **Sentence-Transformers**: Provides offline local embeddings (mapping to Titan Embeddings V2 1024-dimension space) during offline testing.

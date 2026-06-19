# AI Document Intelligence Platform — Architecture Specifications

This file details the structural specifications of the platform, outlining boundaries and components.

## 1. Component Boundaries & Responsibilities
* **React SPA (Frontend)**: Served from CloudFront + S3. Responsible for cookie session creation, direct multipart upload to S3, ingestion status polling, and streaming query responses.
* **API Service (Node.js/TypeScript)**: Express server in Kubernetes. Handles session HMAC signature validation, rate limits, storage quotas, S3 presigned URL generation, Bedrock query embedding, similarity querying against pgvector, prompt rendering, Claude integration, and SSE streaming.
* **Worker Service (Python)**: Standalone boto3 polling script. Receives SQS events, downloads PDFs, Sniffs magic numbers, parses text via PyMuPDF, chunks paragraphs, calls Titan Embeddings V2, and commits vectors to Postgres.
* **Amazon SQS & DLQ**: Intermediate broker for ingestion jobs. DLQ alerts on message depth > 0 after 3 attempts.
* **Amazon RDS PostgreSQL + pgvector + RDS Proxy**: Holds transactional session state and dimensional vector indexes. RDS Proxy pools connections and delegates auth to IAM.

## 2. Ingestion Flow Topology
```
[User Browser] ──(S3 Presigned URL)──> [Amazon S3]
                                           │
                                     (ObjectCreated)
                                           │
                                           ▼
[Celery Worker Pods (Scaled by KEDA)] <── [Amazon SQS]
```

## 3. Strict Tenancy Partitioning
All relational tables maintain a `session_id` column. Cross-session queries must be blocked at the database execution level via parameterized statements:
```sql
SELECT content, page_number FROM document_chunks 
WHERE session_id = $1 AND embedding <=> $2::vector ASC LIMIT 5;
```
Session signatures are verified on every request using an HMAC token stored inside the cookie, preventing IDOR-based access leakage.

## 4. Local Testing & Mock Specifications
To reduce cloud costs and enable offline development, the system supports a local testing topology:
* **AWS Mocking (Localstack)**: Core AWS integrations (Amazon S3 and SQS) are replicated locally using `Localstack` via Docker. S3 bucket events and SQS polling use custom local endpoints (e.g. `http://localhost:4566`).
* **Vector Indexing (pgvector)**: A local container running PostgreSQL with the `pgvector` extension provides 100% database parity with production RDS, eliminating the need for separate mock vector databases.
* **Local LLM & Embeddings (Ollama & Offline Transformers)**:
  - **Ollama**: Emulates text generation models locally (e.g., Llama3/Mistral APIs mapped to Bedrock interfaces).
  - **Sentence-Transformers**: Provides offline local embeddings (mapping to Titan Embeddings V2 1024-dimension space) during offline testing.

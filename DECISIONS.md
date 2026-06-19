# Architecture Decision Records (ADR)

This log tracks the rationale, decisions, and tradeoffs for the platform's core infrastructure.

## ADR-001: Node.js API and Python Worker Polyglot split
* **Status**: Approved
* **Context**: We need to handle concurrent streaming SSE query sessions while performing text extraction and embeddings.
* **Decision**: Split backend into a Node.js/TypeScript API (concurrency, fast Web I/O) and a Python Worker (Doc extraction, embeddings API calls).
* **Tradeoffs**: Managing two container build pipelines and separate service lifecycles.

## ADR-002: Custom boto3 SQS Consumer instead of Celery
* **Status**: Approved
* **Context**: In `Analysis2.txt`, Celery on Redis was recommended. However, Celery SQS transport has stability issues.
* **Decision**: Write a custom Python worker polling SQS directly via `boto3`.
* **Rationale**: Simplifies dependencies, uses native AWS-SDK retry behaviors, and removes Celery wrapper complexity.

## ADR-003: React SPA served from S3/CloudFront
* **Status**: Approved
* **Context**: Decoupling the frontend from the Kubernetes cluster.
* **Decision**: Compile the React client into static assets and serve via S3 + CloudFront.
* **Rationale**: Lowers operating cost, scales automatically, and demonstrates cloud-native pattern judgment.

## ADR-004: Amazon Bedrock Titan V2 + Claude
* **Status**: Approved
* **Context**: Avoid sharing API keys for third-party endpoints inside EKS.
* **Decision**: Bind Bedrock foundation models using IAM credentials via IRSA.
* **Rationale**: Aligns directly with AWS-DOP security guidelines.

## ADR-005: PyMuPDF instead of Docling
* **Status**: Approved
* **Context**: Parsing multimodal PDFs requires heavy resources.
* **Decision**: Target text-native PDFs using PyMuPDF (`fitz`) for v1.
* **Rationale**: Reduces container size, improves processing times, and keeps implementation scoped.

## ADR-006: RDS Proxy + IAM DB Authentication
* **Status**: Approved
* **Context**: Secure EKS connections to PostgreSQL.
* **Decision**: Connect using IAM DB authentication tokens through an RDS Proxy.
* **Rationale**: Removes password storage in K8s, handles high pod scaling without connection exhaustion.

## ADR-007: Local Testing Mock Environment (Localstack, Local pgvector, Local LLMs)
* **Status**: Approved
* **Context**: Avoid expensive cloud billing and API latency during local testing, development, and CI phases.
* **Decision**: Implement `Localstack` to mock AWS S3/SQS, use a local containerized PostgreSQL database with the `pgvector` extension for 100% vector store parity, and integrate `Ollama`/local offline embeddings for text generation/embeddings locally.
* **Rationale**: Decouples local execution from AWS API keys/bills, guarantees 100% SQL and indexing parity with production, and permits developer workflows to execute entirely offline.

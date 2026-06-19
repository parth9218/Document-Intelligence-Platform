# Active Architectural Decisions

This document summarizes active decisions currently being implemented.

## Decoupled Polyglot Architecture
* **Node.js Express TypeScript API**: Concurrency handling and streaming.
* **Python boto3 Worker**: Async text ingestion and Bedrock integration.
* **S3 direct uploads**: Frontend fetches presigned URLs from API and uploads directly to S3.
* **Amazon SQS Queue**: Handoff mechanism from S3 to Worker.
* **pgvector**: RDS PostgreSQL with HNSW similarity index.

## Local Testing & Mock Environments
* **Localstack**: Used to mock S3 and SQS locally.
* **Local pgvector**: Enforce database parity by running pgvector in a local Docker container.
* **Local LLM Providers**: Support for local models (e.g. Ollama, Sentence-Transformers) to bypass Bedrock API costs during local execution.

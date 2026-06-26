# Python Background Worker Development Skill

## Purpose

This skill defines the engineering standards, architectural principles, and implementation conventions for Python background workers that consume tasks from a queue and perform asynchronous processing.

The worker must be:

- Reliable
- Idempotent
- Observable
- Horizontally scalable
- Fault tolerant
- Easy to operate in production

---

# Responsibilities

A worker is responsible only for asynchronous business logic.

Typical responsibilities include:

- Consuming queue messages
- Validating message payloads
- Downloading required resources
- Processing data
- Calling external services
- Persisting results
- Updating processing status
- Emitting metrics and logs

A worker must never expose HTTP APIs or contain presentation logic.

---

# Design Principles

## Single Responsibility

Each task should perform one business operation.

Avoid workers that execute multiple unrelated workflows.

---

## Stateless

Workers must remain stateless.

Persistent state belongs in external systems such as:

- PostgreSQL
- Redis
- S3
- Object storage

Never depend on local filesystem state.

---

## Idempotency

Every task must be safely retryable.

Repeated execution must not produce:

- duplicate database records
- duplicate side effects
- duplicate external API calls

Prefer database constraints and idempotency keys over in-memory tracking.

---

## Fail Fast

Validate inputs immediately.

Reject invalid messages before expensive processing begins.

---

## Explicit State Transitions

Processing stages should be explicit.

Example:

```text
Queued
Downloading
Processing
Completed
Failed
```

Never infer state from logs.

---

# Project Structure

```text
worker/

├── app/
│   ├── consumers/
│   ├── handlers/
│   ├── services/
│   ├── repositories/
│   ├── models/
│   ├── schemas/
│   ├── clients/
│   ├── utils/
│   ├── config/
│   └── telemetry/
├── tests/
└── main.py
```

---

# Layer Responsibilities

## Consumers

Receive queue messages.

Responsibilities:

- Deserialize payload
- Validate schema
- Invoke handler
- Handle retries

No business logic.

---

## Handlers

Coordinate the workflow.

Responsibilities:

- Call services
- Manage transactions
- Update status

Keep orchestration only.

---

## Services

Contain business logic.

Examples:

- Document extraction
- Chunking
- Embedding generation

---

## Repositories

Only database access.

No business rules.

---

## Clients

External integrations.

Examples:

- S3
- SQS
- Bedrock
- Gemini
- OpenAI

All SDK usage belongs here.

---

# Queue Processing

Workers should:

1. Receive message
2. Validate payload
3. Load required resources
4. Execute business logic
5. Persist results
6. Acknowledge completion

Do not acknowledge messages before successful processing.

---

# Message Contract

Messages should contain only identifiers and metadata.

Example:

```text
{
  jobId,
  documentId,
  sessionId,
  version
}
```

Never include large payloads inside queue messages.

---

# Error Handling

Categorize errors.

## Retryable

Examples:

- Network timeout
- Temporary service unavailable
- Rate limiting

Retry with exponential backoff.

---

## Non-Retryable

Examples:

- Invalid payload
- Missing resource
- Unsupported document

Mark job as failed.

Do not retry indefinitely.

---

# Database Access

Use:

- SQLAlchemy
- Repository pattern
- Explicit transactions

Keep transactions short.

Never hold transactions while:

- downloading files
- calling LLMs
- generating embeddings

---

# External Services

Wrap all external services behind client abstractions.

Never call SDKs directly from handlers.

Example:

```text
EmbeddingClient
StorageClient
QueueClient
```

---

# Configuration

Configuration must come from:

- Environment variables
- Configuration objects

Never hardcode:

- endpoints
- credentials
- bucket names
- queue names

---

# Logging

Use structured logging.

Every log should include:

- jobId
- documentId
- sessionId
- correlationId

Never log sensitive data.

---

# Metrics

Track:

- Jobs received
- Jobs completed
- Jobs failed
- Retry count
- Processing duration
- Queue latency
- External API latency

Expose Prometheus-compatible metrics.

---

# Tracing

Every task should propagate a correlation ID.

Trace:

Queue
→ Worker
→ Database
→ External Services

---

# Concurrency

Workers must assume multiple instances process jobs concurrently.

Avoid:

- shared mutable state
- global caches
- singleton business state

---

# Resource Management

Release resources promptly.

Always close:

- database sessions
- file handles
- network clients

---

# Performance

Batch operations when appropriate.

Avoid:

- N+1 queries
- repeated downloads
- repeated embedding requests

Stream large files where possible.

---

# Testing

Every handler should support:

- Unit tests
- Integration tests

Mock external services.

Do not mock business logic.

---

# Security

Never trust queue messages.

Validate:

- schema
- identifiers
- authorization context

Never log secrets or tokens.

---

# Anti-Patterns

Do not:

- Put business logic in consumers
- Call databases directly from clients
- Mix orchestration and business logic
- Swallow exceptions
- Retry non-retryable failures
- Use global mutable state
- Hardcode configuration
- Perform long-running work inside database transactions

---

# Definition of Done

A worker task is complete only when:

- Input is validated
- Processing is idempotent
- State transitions are persisted
- Errors are categorized correctly
- Retries are safe
- Logs are structured
- Metrics are emitted
- External calls are abstracted
- Tests cover success and failure paths
- No architectural conventions are violated

# Task 301: API Similarity Search & Tenancy Enforcement (Prisma ORM)

## Goal
Implement secure, session-isolated similarity searching of user questions against the vector store using TypeScript Express and Prisma Client raw parameterization, supporting environment-driven embedding providers (Cloud Bedrock vs. Local model) matching the Python worker's configuration.

## Scope
Update the Express API to dynamically switch embedding providers based on environment configuration (`EMBEDDING_PROVIDER`), embed user questions using the active provider (Amazon Bedrock Titan V2 for cloud, or local model for offline/local execution matching the Python worker's local embeddings), and execute pgvector similarity queries using Prisma's `$queryRaw` interface with strict session tenancy enforcement.

## Files Expected To Change
* `apps/api/src/config/index.ts`
* `apps/api/src/services/embedding.service.ts`
* `apps/api/src/services/search.service.ts`
* `apps/api/src/routes/query.route.ts`
* `apps/api/src/controllers/query.controller.ts`

## Dependencies
* Task 101 (Database Schema via Prisma ORM)
* Task 203 (Worker Vector Storage & Status Updates)

## Acceptance Criteria
* **Environment-Driven Embedding Provider Factory**:
  * Read `EMBEDDING_PROVIDER` environment variable from API configuration (`bedrock` vs `local`, default `bedrock`).
  * **Cloud Provider (`EMBEDDING_PROVIDER=bedrock`)**: Invoke Amazon Bedrock Titan Embeddings V2 (`amazon.titan-embed-text-v2:0`) via AWS SDK v3 `@aws-sdk/client-bedrock-runtime` to embed user questions into a normalized 1024-dimension float vector.
  * **Local Provider (`EMBEDDING_PROVIDER=local`)**: Use a local embedding mechanism (e.g. `@xenova/transformers` with `intfloat/e5-large-v2` applying `"query: <text>"` prefix formatting) to generate a 1024-dimension float vector matching the exact embedding space used by the Python worker's `LocalEmbeddingProvider`.
* **Vector Similarity Query (`$queryRaw`)**:
  * Perform cosine distance calculation (`<=>`) against `document_chunks` table using Prisma's `$queryRaw` tagged template literal (preventing SQL injection).
* **Strict Tenancy Isolation**:
  * Filter strictly by the current user's authenticated `session_id` using query parameter bindings (e.g. `WHERE "session_id" = ${sessionId}::uuid`). Do not permit inline string interpolation.
* **Distance Threshold & Top-K Results**:
  * Filter out chunks with cosine distance > 0.5.
  * Retrieve top-5 nearest neighbor chunks sorted by distance in ascending order (`ORDER BY embedding <=> ${queryVector}::vector ASC LIMIT 5`).
  * Return fields: `id`, `document_id`, `content`, `page_number`, `distance`, and associated document `filename`.

## Validation Steps
1. **Provider Switching Verification**:
   * Verify that setting `EMBEDDING_PROVIDER=bedrock` routes query embedding calls to Bedrock Titan V2.
   * Verify that setting `EMBEDDING_PROVIDER=local` routes query embedding calls to the local embedding engine without invoking AWS network calls.
2. **Tenancy Isolation & Similarity Search Verification**:
   * Seed database with document vector chunks for session A and session B under both provider modes.
   * Query API via `POST /api/query` with matching session A cookie.
   * Assert that search results only contain chunks belonging to session A, sorted by cosine distance in ascending order.
   * Verify that queries from session B do not leak session A chunks.
   * Verify that requests with invalid/missing session signatures return 401 Unauthorized.

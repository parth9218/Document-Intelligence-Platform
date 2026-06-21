# Task 301: API Similarity Search & Tenancy Enforcement (Prisma ORM)

## Goal
Implement secure, session-isolated similarity searching of user questions against the vector store using TypeScript Express and Prisma Client raw parameterization.

## Scope
Update the Express API to embed user questions via Bedrock Titan V2 and run pgvector similarity queries using Prisma's `$queryRaw` interface.

## Files Expected To Change
* `apps/api/src/services/bedrock.ts`
* `apps/api/src/services/search.ts`
* `apps/api/src/routes/query.ts`

## Dependencies
* Task 101 (Database Schema via Prisma ORM)
* Task 203 (Worker Vector Storage & Status Updates)

## Acceptance Criteria
* Embed user query into a 1024-dimension float vector using Bedrock Titan Embeddings V2.
* Perform cosine distance query (`<=>`) against `document_chunks` table.
  * Use Prisma's `$queryRaw` tagged template literal (which handles query parameters safely, preventing SQL injection) to execute the vector operations.
* **Strict Tenancy Isolation**: Filter strictly by the current user's authenticated `session_id` using query parameter bindings (e.g. `WHERE "session_id" = ${sessionId}`). Do not permit inline string interpolation.
* Filter out chunks with cosine distance > 0.5.
* Retrieve top-5 nearest neighbor chunks sorted by distance in ascending order, including fields: `id`, `document_id`, `content`, `page_number`, and `doc_name`.

## Validation Steps
1. Seed database with vector chunks for session A and session B.
2. Query API via POST with matching session A cookie.
3. Assert that results only contain chunks belonging to session A, sorted by cosine distance in ascending order.
4. Verify that requests with an invalid/modified session signature return 401 or 403.

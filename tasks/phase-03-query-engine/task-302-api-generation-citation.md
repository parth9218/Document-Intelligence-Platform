# Task 302: Grounded Generation, SSE Streaming & Citations

## Goal
Assemble context prompt, invoke Bedrock Claude response stream, process text chunks with real-time citation parsing, and filter out hallucinated references before streaming to the client.

## Scope
Implement prompt template construction, Bedrock Claude stream reader (SSE/EventStream format), inline citation parser, and reference validator inside `apps/api` using TypeScript Express.

## Files Expected To Change
* `apps/api/src/services/llm.ts`
* `apps/api/src/routes/query.ts`

## Dependencies
* Task 301 (API Similarity Search & Tenancy Enforcement via Prisma ORM)

## Acceptance Criteria
* **Context Formatter**: Combine top-5 retrieved chunks into prompt context labeled sequentially `[1]` to `[5]`, containing `doc_name`, `page_number`, and `content`.
* **Prompt Instructions**: Instruct Claude strictly to answer using the provided contexts, and output inline bracket citations (e.g. `[1]`) for every statement.
* **SSE Streaming**: Expose query route as a Server-Sent Events endpoint `/api/query` using Express response streaming (`res.setHeader('Content-Type', 'text/event-stream')`).
* **Citation Parser & Validator**:
  * Scan outgoing text tokens for bracket patterns (`[n]`).
  * Verify that any output citation `n` falls within the range `[1..num_chunks]` of actually retrieved contexts.
  * Filter out or mark as unverified any citation index referencing a document context not provided to the model.
  * Stream citation metadata (index mapping to `doc_name` and `page_number`) alongside text chunks so that the client has full details for interactive tooltips.

## Validation Steps
1. Query API via client using EventSource or fetch reader.
2. Verify response streams in real-time chunk-by-chunk using SSE convention.
3. Assert that hallucinated citations (e.g., model outputs `[6]` when only 3 chunks exist) are filtered or handled cleanly.
4. Verify metadata frame contains correct mapping of bracket ID to filename and page number.

# Task 301: API Similarity Search

## Goal
Implement similarity searching of user questions against the vector store.

## Scope
Update Node.js API to embed queries via Bedrock and run cosine distance queries.

## Files Expected To Change
* `apps/api/src/services/bedrock.ts`
* `apps/api/src/services/search.ts`

## Dependencies
* Task 101 (Database Schema)
* Task 203 (Worker Vector Storage)

## Acceptance Criteria
* Embed user query via Titan Embeddings V2 model.
* Perform cosine similarity distance (`<=>`) matching current session ID with distance limit <= 0.5.
* Retrieve top-5 nearest neighbor chunks with metadata.

## Validation Steps
1. Seed database with test vector chunks.
2. Query API via POST with matching session cookie.
3. Assert returning matching chunks sorted by relevance.

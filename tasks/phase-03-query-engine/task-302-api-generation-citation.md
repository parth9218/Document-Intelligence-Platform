# Task 302: Grounded Generation & Citations

## Goal
Assemble prompt, call Bedrock Claude, stream answers, and parse hybrid citations.

## Scope
Implement prompt templating, Bedrock Claude SSE stream reader, and citation extractor in `apps/api`.

## Files Expected To Change
* `apps/api/src/services/llm.ts`
* `apps/api/src/routes/query.ts`

## Dependencies
* Task 301 (API Similarity Search)

## Acceptance Criteria
* Prompts format context chunks with bracket IDs (`[1]`..`[n]`).
* Instruct model to only answer using reference context and output inline bracket citations.
* Verify generated brackets correspond to retrieved set; discard hallucinatory references.

## Validation Steps
1. Query API with test questions.
2. Assert returned stream uses Server-Sent Events syntax.
3. Verify final response JSON metadata correctly includes source names, page numbers, and snippet values.

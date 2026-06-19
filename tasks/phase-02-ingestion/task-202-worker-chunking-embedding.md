# Task 202: Worker Embedding Generation

## Goal
Segment extracted document text and invoke Amazon Bedrock to generate vector embeddings.

## Scope
Implement paragraph-based chunker and invoke Bedrock Titan Embeddings V2 inside `apps/worker`.

## Files Expected To Change
* `apps/worker/chunker.py`
* `apps/worker/embeddings.py`

## Dependencies
* Task 201 (Worker Document Extraction)

## Acceptance Criteria
* Chunks text into ~500 token segments with 75-token overlaps.
* Calls Bedrock Titan Embeddings V2 with batches of <= 25 chunks.
* Implements retries with exponential backoff on transient errors.

## Validation Steps
1. Verify paragraph chunker splits a large document into overlapping arrays.
2. Mock Bedrock Titan V2 responses and assert chunk arrays generate 1024-dimension float arrays.

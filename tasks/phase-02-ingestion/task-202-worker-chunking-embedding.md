# Task 202: Worker Chunking & Embedding Generation

## Goal
Split extracted page text into overlapping paragraph chunks, generate 1024-dimension
vector embeddings for each chunk using Amazon Bedrock Titan Embeddings V2, and prepare
batches for idempotent persistence in Task 203.

## Scope
Implement `apps/worker/chunker.py` and `apps/worker/embeddings.py`.

## Files Expected To Change
* `apps/worker/chunker.py`
* `apps/worker/embeddings.py`

## Dependencies
* Task 201 (Worker Document Extraction — provides page-numbered text input)

---

## Stage Transition

**Entry action:** Update `processing_jobs.status = 'chunking'` before chunking begins.
Set `processing_jobs.total_chunks = <count>` immediately after chunking completes
(before embedding begins). This allows the frontend to display an accurate denominator
in progress reporting (e.g., "0 / 450 chunks embedded").

---

## Chunking Strategy

**Algorithm:** Paragraph-based sliding window with token overlap.

| Parameter       | Value             |
|-----------------|-------------------|
| Target size     | ~500 tokens       |
| Overlap         | 75 tokens         |
| Split boundary  | Paragraph breaks (`\n\n`), falling back to sentence boundaries |

**Output per chunk:**
```python
@dataclass
class Chunk:
    document_id: str
    session_id:  str
    chunk_index: int        # Sequential 0-based index within the document
    page_number: int        # Source page (from extraction stage)
    content:     str        # Chunk text
    token_count: int        # Approximate token count
```

`chunk_index` is the globally sequential index across all pages of the document
(not per-page). This is the key used for idempotent upsert in Task 203.

---

## Embedding Generation

**Entry action:** Update `processing_jobs.status = 'embedding'`.

### Batching

* Process chunks in batches of **50** for embedding calls.
* Do NOT embed all chunks in one call — Bedrock has per-request size limits.
* One Bedrock API call per chunk (Titan Embeddings V2 takes one text input per invocation).
  Group 50 sequential chunks and call Bedrock 50 times per batch cycle before persisting.

### Bedrock API Call

```python
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

def embed(text: str) -> list[float]:
    response = bedrock.invoke_model(
        modelId='amazon.titan-embed-text-v2:0',
        body=json.dumps({
            "inputText": text,
            "dimensions": 1024,
            "normalize": True
        }),
        contentType='application/json',
        accept='application/json'
    )
    body = json.loads(response['body'].read())
    return body['embedding']   # List[float] of length 1024
```

### Retry Policy

Wrap each Bedrock call with exponential backoff:
* Maximum 3 attempts.
* Initial delay: 1 second; backoff multiplier: 2x.
* Retry on: `ThrottlingException`, `ServiceUnavailableException`.
* Raise on: `ValidationException`, `ModelNotReadyException` (permanent errors).

### Local Testing Override

When `EMBEDDING_PROVIDER=local` environment variable is set, use
`sentence-transformers` with the `all-MiniLM-L6-v2` model (384 dimensions) or
`intfloat/e5-large-v2` (1024 dimensions) to match Titan's output dimension.
The embedding function signature must be identical; only the implementation switches.

---

## Output Contract

Return a list of batches to Task 203 for persistence:

```python
List[List[Chunk]]  # Each inner list = one batch of 50 chunks with embeddings attached
```

Task 203 processes one batch at a time, persisting it and updating `checkpoint_index`
before moving to the next.

---

## Acceptance Criteria
* `processing_jobs.status = 'chunking'` set before chunking.
* `processing_jobs.total_chunks` set to the total chunk count immediately after chunking completes.
* `processing_jobs.status = 'embedding'` set before first embedding call.
* Each chunk carries a `chunk_index` that is globally sequential within the document (0-based).
* Bedrock embedding calls are batched in groups of 50.
* Exponential backoff with max 3 retries on transient Bedrock errors.
* `EMBEDDING_PROVIDER=local` switches to Sentence-Transformers without changing the function signature.
* Permanent Bedrock errors propagate as exceptions (Task 203 handles DB failure update).

## Validation Steps
1. Run chunker on a 10-page PDF. Verify output chunk array has correct `chunk_index` and `page_number` fields.
2. Mock Bedrock client; verify chunker calls it once per chunk and produces 1024-float arrays.
3. Simulate `ThrottlingException` on attempt 1; verify retry fires and succeeds on attempt 2.
4. Set `EMBEDDING_PROVIDER=local` and verify Sentence-Transformers embeddings are returned.

## Definition Of Done
* `chunker.py` and `embeddings.py` implemented and unit-tested.
* `total_chunks` correctly set in DB after chunking phase.
* Batch output structure confirmed compatible with Task 203 persistence interface.

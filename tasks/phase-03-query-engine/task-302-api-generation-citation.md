# Task 302: Grounded Generation, SSE Streaming & Citations

## Goal

Implement a provider-abstracted LLM answer generation pipeline that assembles a grounded context prompt from retrieved document chunks, streams the LLM response token-by-token over Server-Sent Events, parses and validates inline bracket citations against the injected context window, and emits structured citation metadata frames to the client.

---

## Dependencies

- Task 301 (API Similarity Search & Tenancy Enforcement) must be complete.

---

## Architecture

### LLM Provider Abstraction

The LLM layer must follow the same provider abstraction pattern already established for embedding models in Task 301. Define a common `ILlmProvider` interface with a single streaming method, then create two concrete implementations behind it:

- **Bedrock provider** — used in production on AWS EKS. Invokes Amazon Bedrock's Claude model using IAM Roles for Service Accounts (IRSA) for authentication, identical to how the Bedrock embedding provider authenticates. Streams text deltas from Bedrock's response event stream.
- **Local provider** — used during local development to avoid API costs. Connects to an **Ollama instance running in a Docker container**. Communicates with Ollama via its OpenAI-compatible HTTP streaming API. Requires no additional npm packages — Node.js 18's built-in `fetch` is sufficient.

A factory function resolves the active provider from configuration, following the exact same pattern as `getEmbeddingProvider()` in `embedding.service.ts`. An unsupported provider value must throw a domain-specific error (a new `AppError` subclass, consistent with `UnsupportedEmbeddingProviderError`).

### Configuration

Add a dedicated `llm` section to the application config (in `config/index.ts`) controlling:
- Which provider is active (`LLM_PROVIDER` env var, defaulting to `bedrock`)
- The Bedrock model ID to invoke (env var, defaulting to a Claude Haiku model)
- The local Ollama model tag and endpoint URL (env vars, with sensible localhost defaults)
- Maximum output tokens (env var, with a sensible default)

---

## Files Expected to Change

- `apps/api/src/services/llm.service.ts` — new file containing the interface, both provider implementations, the factory function, and the citation validator utility.
- `apps/api/src/controllers/query.controller.ts` — wire the LLM streaming service into the existing SSE path, replacing the placeholder token frame.
- `apps/api/src/config/index.ts` — add the `llm` configuration section.
- `apps/api/src/errors/app-error.ts` — add `UnsupportedLlmProviderError`.
- `apps/api/src/tests/query.test.ts` — extend SSE tests to validate citation frames and token streaming.

---

## Behaviour

### Prompt Assembly

Before invoking the LLM, assemble a context window from the retrieved `SearchResultChunk` array. Each chunk is assigned a sequential bracket index starting at `[1]`. The system prompt must strictly instruct the model to answer only using the provided contexts and to cite the bracket index for every statement it makes. If the answer cannot be found in any provided context, the model must respond with a clear "not found" message rather than speculating.

### Streaming

The LLM response is streamed to the client token-by-token over the existing SSE connection that was opened by the search handler. The controller hands off to the LLM service after emitting the `event: context` frame, rather than the empty placeholder token frame currently in place.

### Citation Parsing & Validation

As text deltas arrive from the LLM, scan each delta for bracket citation patterns (e.g. `[1]`, `[2]`). For every detected citation index, validate that it falls within the range of actually retrieved chunks. Valid citations trigger an `event: citation` frame carrying the citation index, the corresponding filename, and the page number — giving the client everything it needs to render interactive source tooltips. Each unique valid citation index is emitted only once per response. Invalid citations (indices that reference documents not present in the context window) are stripped from the token text before it reaches the client and logged as a warning.

### Disconnect Safety

If the client closes the connection mid-stream, the upstream LLM stream (Bedrock or Ollama) must be aborted immediately to release resources. Use an `AbortController` tied to the request's close event.

---

## SSE Frame Contract

The complete SSE frame sequence for a streaming query response is:

| Event | Description |
|---|---|
| `context` | Emitted first. Contains the query text and the array of retrieved document chunks (unchanged from Task 301). |
| `token` | One frame per LLM text delta. Contains the raw text fragment, with any invalid citation tokens already stripped. |
| `citation` | Emitted when a valid bracket citation is detected. Contains the citation index, filename, and page number. |
| `error` | Emitted if a stream-level failure occurs (e.g. LLM provider unavailable). Contains a message and error code. |
| `done` | Final frame signalling stream completion. |

The non-streaming JSON response path (no `Accept: text/event-stream` and no `stream: true` body flag) continues to return only retrieval results without LLM generation.

---

## Acceptance Criteria

1. `getLlmProvider()` factory resolves the correct provider implementation based on `LLM_PROVIDER` configuration and throws `UnsupportedLlmProviderError` for any unrecognised value.
2. Both providers stream text deltas using `ILlmProvider`'s streaming interface — the controller is unaware of which provider is active.
3. The Bedrock provider authenticates exclusively via IRSA with no static credentials in code or environment.
4. The local provider connects to an Ollama Docker container with no additional npm dependencies beyond what already exists.
5. The assembled prompt grounds the model strictly on the retrieved context window using numbered bracket references.
6. Valid citations produce `event: citation` frames with correct filename and page number metadata.
7. Hallucinated citations (indices beyond the retrieved chunk count) are stripped from the token stream and never produce citation frames.
8. Client disconnection aborts the upstream stream cleanly with no dangling connections.
9. All 41 existing API tests continue to pass.

---

## Validation Steps

1. Start Ollama locally in Docker and pull a small model (e.g. `llama3.2`).
2. Set `LLM_PROVIDER=local` and `EMBEDDING_PROVIDER=local` in the local `.env` file.
3. Send a streaming POST request to `/api/query/search` with `Accept: text/event-stream`.
4. Verify that real token text deltas are received in `event: token` frames (not empty placeholders).
5. Verify that at least one `event: citation` frame is received, containing a valid filename and page number.
6. Mock the LLM to emit a citation index beyond the number of retrieved chunks and verify it is stripped from token output and produces no citation frame.
7. Disconnect the client mid-stream and verify the Ollama or Bedrock connection terminates cleanly.
8. Run the full Jest test suite and verify all tests pass.

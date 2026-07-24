# Frontend Phase 5: Query Interface, Streaming Chat & Citations

## Goal

Implement the streaming Q&A chat interface in the React SPA frontend (`apps/frontend`), connecting to the backend's `POST /api/query/search` Server-Sent Events stream to render real-time grounded answer generation, interactive inline citation popovers, and retrieved document source accordions.

---

## Dependencies

- Task 301 (API Similarity Search & Tenancy Enforcement) — complete.
- Task 302 (API Answer Generation & Citation Verification) — complete.
- Frontend Phase 3 & 4 (Batch Upload & Real-Time Ingestion Progress) — complete.

---

## Scope & Expected Code Changes

Implement the query interface inside `apps/frontend` using TypeScript, React, and Tailwind CSS:

### New Files

- `apps/frontend/src/hooks/useQuery.ts` — Custom hook managing the SSE streaming fetch request to `POST /api/query/search`, processing stream event frames (`context`, `token`, `citation`, `error`, `done`), and maintaining chat message history.
- `apps/frontend/src/components/chat/chat-interface.tsx` — Main chat layout component containing message history scroll area, user input prompt box, and controls.
- `apps/frontend/src/components/chat/chat-bubble.tsx` — Message bubble component rendering user questions and streaming assistant responses.
- `apps/frontend/src/components/chat/citation-badge.tsx` — Interactive inline citation badge (`[1]`, `[2]`) rendered within assistant answer text.
- `apps/frontend/src/components/chat/source-popover.tsx` — Hover/click popover card displaying citation source metadata (`filename`, `pageNumber`, text snippet).
- `apps/frontend/src/components/chat/source-accordion.tsx` — Collapsible panel listing all top-K retrieved context chunks associated with an answer.

### Modified Files

- `apps/frontend/src/types/api.d.ts` — Add TypeScript types for query request payloads, search result chunks, citation metadata, and chat message structures.
- `apps/frontend/src/store/useAppStore.ts` — Add chat message history state and query UI state variables if needed.
- `apps/frontend/src/app/page.tsx` — Integrate the chat interface component into the main application layout alongside the document management feed.

---

## Behaviour & Features

### 1. Query SSE Stream Connection (`useQuery.ts`)

- Sends a `POST /api/query/search` request with a JSON body `{ query: string, stream: true }` and header `Accept: text/event-stream`.
- Uses native `fetch` with `ReadableStream` reader (or WHATWG stream parser) to process incoming line-by-line SSE events (`event: <name>\ndata: <json>`).
- Listens for the 5 backend SSE event frames:
  1. **`context`**: Contains the original query string and array of retrieved `SearchResultChunk` items (`id`, `documentId`, `filename`, `pageNumber`, `content`, `distance`). Stores these context chunks for citation mapping and source accordion display.
  2. **`token`**: Contains incremental text deltas (`{ token: string }`). Appends tokens to the active assistant response bubble in real-time.
  3. **`citation`**: Contains validated citation metadata (`{ index: number, filename: string, pageNumber: number | null }`). Maps the citation index `[n]` to the corresponding retrieved chunk.
  4. **`error`**: Contains stream-level error information (`{ message: string, errorCode: string }`). Halts streaming and displays an inline error banner.
  5. **`done`**: Signal `[DONE]`. Marks the active message stream as complete and re-enables the prompt input.
- Provides an `abort()` function using `AbortController` to allow the user to stop generation mid-stream.

### 2. Chat Layout & Input (`chat-interface.tsx`)

- Auto-scrolls the message container to the bottom as text tokens stream in, pausing auto-scroll if the user manually scrolls up.
- Input box with auto-resizing textarea: `Enter` submits the query, `Shift + Enter` inserts a newline.
- Disables submission when the input is empty/whitespace or while an answer is actively streaming.
- Displays a "Stop Generating" button while streaming is active.
- Provides a "Clear Chat" control to reset local message history.
- Displays an empty state banner when no messages exist, offering quick prompt suggestions.

### 3. Inline Citation Badges & Source Popovers (`citation-badge.tsx`, `source-popover.tsx`)

- Scans assistant message text for bracket citation patterns (e.g. `[1]`, `[2]`).
- Replaces raw bracket text with interactive, styled inline badges (`citation-badge.tsx`).
- Clicking or hovering on a citation badge opens a popover card (`source-popover.tsx`) displaying:
  - Source document filename and page number badge.
  - The exact referenced text snippet from the retrieved context chunk.
  - Cosine relevance score / distance metric.

### 4. Retrieved Sources Accordion (`source-accordion.tsx`)

- Renders an expandable "Retrieved Context Sources (N)" accordion below each assistant response.
- Lists all top relevance-matched document chunks returned in the `context` frame.
- Displays the sequential index `[1]`, filename, page number, and full chunk text snippet for complete source transparency.

---

## Acceptance Criteria

1. **Streaming Answer Generation**: Submitting a query streams text deltas into the chat bubble in real-time via SSE without blocking or full-page refreshes.
2. **Citation Mapping**: Inline bracket references (e.g. `[1]`) render as interactive badges linked to the correct retrieved context chunk.
3. **Source Popovers**: Hovering/clicking a citation badge displays a popover with the document name, page number, and referenced text snippet.
4. **Context Sources Accordion**: Each answer includes a collapsible accordion detailing all top-K retrieved context chunks.
5. **Stream Interruption**: Clicking "Stop Generating" aborts the SSE connection immediately and preserves the partial response.
6. **Error Resilience**: Stream errors (e.g. 401 Unauthorized, 400 Bad Query, network disconnects) trigger inline error banners without crashing the UI.
7. **Empty State & Accessibility**: Renders accessible keyboard navigation for input submission (`Enter` / `Shift+Enter`), citation popovers, and prompt suggestions.

---

## Validation Steps

1. Start the API server, worker, database, and frontend dev server (`npm run dev` in `apps/frontend`).
2. Upload a test PDF document via the dashboard and wait for ingestion to reach `completed`.
3. Enter a question related to the document in the chat prompt box and press `Enter`.
4. Verify that text streams into the assistant bubble token-by-token.
5. Verify that `[1]` citation badges appear inline within the answer text.
6. Click a `[1]` citation badge: assert the source popover opens displaying the correct document filename, page number, and text snippet.
7. Expand the "Retrieved Context Sources" accordion: assert all retrieved context chunks are listed.
8. Submit a long query and click "Stop Generating" mid-stream: assert the stream aborts cleanly and the UI remains responsive.

# Frontend Phase 5 Tasks: Query Interface & Streaming Q&A

This file details the tasks required to build the chat layout, handle query streams, and render citation popovers.

---

## Task F5.1: Chat Layout & SSE Query Stream Hook

### Goal
Implement the chat message interface and stream chunked query responses in real-time.

### Scope
Create the chat layout panel, user query text box, and query hook reading streaming responses.

### Files Expected To Change
* `apps/frontend/src/components/layout/chat-interface.tsx`
* `apps/frontend/src/hooks/useQuery.ts`

### Dependencies
* Task F2.3, Task 302 (Grounded Generation)

### Acceptance Criteria
* **Visual History Feed**: Panel displays sequential user queries and assistant responses with loading skeleton templates.
* **Streaming Answer Reader**: `useQuery` sends queries and parses chunked EventSource responses in real-time, appending characters to the active message.
* **Input Blocking**: Lock query inputs and disable submission buttons while responses are active.
* **MSW Streaming Mock**: In `'mock'` mode, MSW intercepts queries and streams a simulated text response chunk-by-chunk over EventSource protocol templates.

### Validation Steps
1. Submit a query. Verify that the assistant message renders chunk-by-chunk in real-time.
2. Confirm the query input text box is disabled during streaming and re-enables on completion.

### Definition Of Done
* Chat interface is implemented and streams responses.

---

## Task F5.2: Citation Parser & Source Popover UI

### Goal
Parse inline text brackets into clickable citation bubbles with detailed hover popovers.

### Scope
Create the citation parser utility and source card popover views.

### Files Expected To Change
* `apps/frontend/src/components/layout/citation-bubble.tsx`
* `apps/frontend/src/components/layout/citation-popover.tsx`
* `apps/frontend/src/lib/citation-parser.ts`

### Dependencies
* Task F5.1

### Acceptance Criteria
* **Bracket Parsing**: Scan text strings for bracket indices (`[1]`, `[2]`) using regular expressions.
* **Badged Replacement**: Replace matched index brackets with clickable badges styled using Tailwind custom theme classes.
* **Hover Card Popover**: Hovering or clicking a badge opens a popover containing chunk metadata: file name, page number, and source quote.
* **Citations Audit**: Filter out or hide citations index references if they exceed the list of context chunks sent in the API stream metadata.

### Validation Steps
1. Inject a message containing `[1]` with source chunk details. Verify that it parses into a bubble. Hover to verify the popover opens.
2. Inject a message containing `[99]` with no context details. Verify that it is filtered out or displayed as unverified text.

### Definition Of Done
* Citation bubbles parse dynamically and popovers render source chunk details correctly.

---

## Task F5.3: Chat Error Handling & Citations Validation

### Goal
Handle stream-level failures, timeout conditions, and empty search states.

### Scope
Configure stream failure interceptors and empty result views.

### Files Expected To Change
* `apps/frontend/src/components/layout/chat-interface.tsx`
* `apps/frontend/src/hooks/useQuery.ts`

### Dependencies
* Task F5.2

### Acceptance Criteria
* **Stream Exception Boundaries**: Catch network drops or stream truncation, displaying helpful retry prompts.
* **Empty Results State**: Show clean "No relevant document details found" alerts when similarity limits are not matched (e.g. cosine distance filters all chunks).
* **Keyboard/Screen Reader Verification**: Verify that focus highlights and screen readers read chat outputs, input text fields, and citation popovers correctly.

### Validation Steps
1. Inject a stream failure half-way through generation. Verify the UI stops streaming and displays a warning prompt with a retry button.
2. Type an unrelated question to return zero context chunks. Confirm the assistant prints a fallback "no relevant details found" response.

### Definition Of Done
* Chat interface handles stream failure scenarios and empty matches gracefully.

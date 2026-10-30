---
title: "Conversational Q&A & Streaming Chat"
description: "useQuery streaming hook, fetch ReadableStream SSE reader, and interactive chat interface."
---

# Conversational Q&A & Streaming Chat

> Real-time token streaming via fetch ReadableStream, client-side AbortController cancellation, and responsive chat bubble rendering.

---

## Streaming Architecture

Because the conversational search endpoint (`POST /api/query/search`) requires an HTTP POST body carrying the user's question, standard browser `EventSource` (which only supports GET) cannot be used. The frontend instead uses `fetch` with a `ReadableStream` reader.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant UI as ChatInterface Component
    participant Hook as useQuery() Hook
    participant API as Express API
    participant Bedrock as Amazon Bedrock (Claude)
    participant Store as Zustand Store

    User->>UI: Enter Question & Submit (Enter Key)
    UI->>Hook: sendQuery(question)
    Hook->>Store: addChatMessage(User Question)
    Hook->>Store: addChatMessage(Empty Assistant Placeholder)

    Hook->>API: POST /api/query/search (credentials: 'include', AbortSignal)
    API-->>Hook: HTTP 200 OK (Transfer-Encoding: chunked)

    loop Stream Parsing
        API-->>Hook: event: context (Retrieved snippet array)
        Hook->>Store: Attach source snippets to active message

        API-->>Hook: event: token (Text chunk delta)
        Hook->>Store: Append token to assistant message text
        Store-->>UI: Real-time text generation with pulsing cursor

        API-->>Hook: event: citation (Verified citation metadata)
        Hook->>Store: Register verified citation index
    end

    alt User Clicks 'Stop Generating'
        User->>UI: Click 'Stop Generating'
        UI->>Hook: abortQuery()
        Hook->>API: AbortController.abort() (Closes connection)
    else Generation Completes
        API-->>Hook: event: done
        Hook->>UI: Finalize assistant message (Remove cursor)
    end
```

---

## ReadableStream SSE Reader (`useQuery`)

Implemented in `src/hooks/useQuery.ts`:

- **Stream Decoding**: Reads the incoming UTF-8 byte stream using `response.body.getReader()`, splitting buffer lines on `\n\n` delimiters.
- **Event Frame Dispatcher**:
    - `event: context`: Delivers the top-5 retrieved context passages.
    - `event: token`: Appends incremental text deltas to the active assistant response.
    - `event: citation`: Binds citation metadata (document name, page number, relevance match) to the message.
    - `event: done`: Closes the active generation cycle.
    - `event: error`: Renders inline conversational alert banners on stream interruptions.
- **AbortController Invariant**: Every query binds an `AbortController`. If a user clicks "Stop Generating" or navigates away, the signal aborts the request, notifying Express to close the Bedrock stream immediately.

---

## Interactive Chat Layout (`ChatInterface`)

The chat workspace provides a fluid conversational interface:

- **Viewport Auto-Scroll**: Automatically scrolls smoothly to the latest streaming token while allowing users to scroll up to inspect previous answers without snapping.
- **Auto-Resizing Prompt Input**: Textarea grows dynamically with multi-line prompts. `Enter` submits the question, while `Shift+Enter` inserts newlines.
- **Prompt Suggestion Pills**: Surfaces common document discovery prompts when chat history is empty.
- **Streaming Pulse Indicator**: Displays an animated pulse indicator while the assistant message is receiving active token chunks.

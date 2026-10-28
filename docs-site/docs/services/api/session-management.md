---
title: "API Session Management"
description: "HMAC-SHA256 cookie signing, constant-time verification, sliding-window renewals, and auto-initialization."
---

# API Session Management

> Stateless cryptographic session verification, constant-time HMAC validation, sliding-window expiration, and automatic guest provisioning.

---

## Authentication Mechanism

Multi-tenancy throughout the platform relies on **cryptographically signed session cookies** rather than centralized identity providers or stateful server sessions. Every incoming request is bound to an active tenant workspace via an HTTP-only cookie (`session_token`).

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant API as Express API
    participant Middleware as Session Middleware
    participant DB as PostgreSQL (sessions)

    User->>API: HTTP Request (Cookie: session_token)
    API->>Middleware: Intercept & Validate Token

    alt Token Missing
        Middleware->>DB: INSERT INTO sessions (expires_at = NOW() + 24h)
        DB-->>Middleware: Session Record Created (UUID)
        Middleware->>Middleware: Generate HMAC-SHA256 Signature
        Middleware->>API: Attach Session to req.session
        API-->>User: Response + Set-Cookie (session_token=id.sig)
    else Token Present
        Middleware->>Middleware: Split id and signature
        Middleware->>Middleware: Compute Expected HMAC-SHA256
        Middleware->>Middleware: crypto.timingSafeEqual(sig, expectedSig)
        alt Signature Valid
            Middleware->>DB: UPDATE sessions SET expires_at = NOW() + 24h
            Middleware->>API: Attach Validated Session
            API-->>User: HTTP 200 OK + Updated Set-Cookie
        else Signature Invalid / Tampered
            Middleware-->>User: HTTP 401 Unauthorized (invalid_session_signature)
        end
    end
```

---

## Cryptographic Token Structure

The cookie payload consists of two period-separated segments:

- **Session Identifier**: Standard UUIDv4 identifying the active database record in the `sessions` table.
- **HMAC Signature**: Hex-encoded SHA-256 hash generated over the UUID using a server-side `SESSION_SECRET`.

### Security Protections

| Security Vector              | Implementation Mechanism    | Purpose                                                                                           |
| :--------------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------ |
| **Timing Attack Mitigation** | `crypto.timingSafeEqual`    | Compares signature buffers in constant time, preventing byte-by-byte timing inference.            |
| **XSS Exfiltration Defense** | `HttpOnly: true`            | Prevents malicious client-side JavaScript from reading or exporting session tokens.               |
| **CSRF Mitigation**          | `SameSite: Lax`             | Blocks unauthorized third-party cross-site request forgery while preserving top-level navigation. |
| **Transport Encryption**     | `Secure: true` (Production) | Enforces cookie transmission exclusively over TLS/HTTPS connections.                              |

---

## Lifecycle & Sliding-Window Renewal

1. **Auto-Initialization**: When a user arrives without a cookie, `GET /api/session` automatically provisions a fresh session record and issues the signed cookie, eliminating registration friction.
2. **Sliding-Window Renewal**: On every valid authenticated interaction, the session middleware updates `expires_at` by an additional 24 hours in both the database and the HTTP `Set-Cookie` header.
3. **Session Purging & Cascade**: When an inactive session passes its 24-hour expiration threshold, background cleanup tasks purge the session record. Relational cascading foreign keys (`ON DELETE CASCADE`) automatically wipe all associated documents, processing jobs, vector chunks, and query logs.

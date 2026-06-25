# Session Management Specification

This document details the cryptographic session management design, middleware flow, and PostgreSQL session tracking mechanism implemented in Task 102.

## 1. Session Lifecycle Flow

The session lifecycle supports dynamic establishment, signature verification, and sliding expiration.

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as Express API Server
    participant DB as PostgreSQL Database
    
    Note over Client, API: Scenario A: Initial Load / No Cookie (Auto-Initialization)
    Client->>API: GET /api/session (No Cookie)
    API->>API: Detect missing session cookie
    API->>API: Generate random token & signed token (HMAC-SHA256)
    API->>DB: INSERT into sessions table (session_token, expires_at)
    DB-->>API: Session created (UUID id)
    API->>Client: 200 OK + Set-Cookie (session_token=signedToken; httpOnly; Secure; SameSite=Lax) + Session JSON Payload

    Note over Client, API: Scenario B: Subsequent Load / Valid Cookie
    Client->>API: GET /api/session (Cookie: session_token=signedToken)
    API->>API: URL-decode and verify signature (HMAC matching)
    API->>DB: SELECT from sessions where session_token = signedToken
    DB-->>API: Active Session Row (expires_at > NOW)
    API->>DB: UPDATE session (last_active_at = NOW, expires_at = NOW + 24h)
    DB-->>API: Session updated
    API->>Client: 200 OK + Set-Cookie (session_token=signedToken; sliding expiration)

    Note over Client, API: Scenario C: Security Violation / Tampered Cookie (401 Error)
    Client->>API: GET /api/session (Cookie: session_token=tamperedToken)
    API->>API: URL-decode and verify signature (HMAC matching)
    API->>API: Signature Verification FAILS (timingSafeEqual is false)
    API->>Client: 401 Unauthorized (Invalid session signature)
```

---

## 2. Cryptographic Security Design

### HMAC Signature
To prevent clients from guessing or enumerating session IDs (database lookup attacks), session cookies are signed using **HMAC-SHA256**. The cookie payload format is:
`session_token = rawToken.signature`
where:
* `rawToken`: 32 bytes of secure random hex.
* `signature`: `Base64(HMAC-SHA256(rawToken, SESSION_SECRET))` with padding removed.

### Timing Attack Mitigation
Signature checking uses `crypto.timingSafeEqual` to perform a constant-time comparison of the incoming signature vs. the expected signature. This prevents attackers from using timing side-channels to brute-force valid signatures.

```typescript
const sigBuffer = Buffer.from(signature);
const expectedSigBuffer = Buffer.from(expectedSignature);
if (sigBuffer.length === expectedSigBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
  return value;
}
```

---

## 3. Cookie Safety Settings

Cookies are issued with strict flags to mitigate standard web vulnerabilities:
* `HttpOnly`: Prevents client-side scripts (e.g. `document.cookie`) from reading the cookie, mitigating Cross-Site Scripting (XSS) token extraction.
* `Secure`: Enforces transmission only over encrypted (HTTPS) connections, preventing interception via eavesdropping.
* `SameSite=Lax`: Restricts cookie transmission on cross-site requests, mitigating Cross-Site Request Forgery (CSRF).

---

## 4. Sliding Expiration & Database Operations

Sessions carry a **24-hour sliding window**:
1. On each valid request, `expires_at` is updated to `NOW + 24 hours` in the database.
2. The `Set-Cookie` header is returned with the updated expiration date.
3. This ensures active sessions remain logged in indefinitely, while idle sessions are automatically pruned/invalidated after 24 hours.

---

## 5. CORS Credentials & SameSite Compatibility

Since session tracking relies entirely on HTTP cookies (`session_token`), the CORS policy and cookie configurations must be aligned to prevent browser blocks:
* **CORS Header Integration**: The Express API must explicitly append `Access-Control-Allow-Credentials: true` to all CORS-authorized preflight and standard responses.
* **SameSite Cookie Settings**: 
  - If the frontend and backend are hosted on different subdomains under the same parent domain (e.g. `app.docintel.com` and `api.docintel.com`), the cookie safety configuration `SameSite=Lax; Secure` is sufficient to allow AJAX transfers.
  - If the frontend and backend are hosted on entirely separate domains (cross-site), the session cookie must be issued with `SameSite=None; Secure` to allow browsers to include it in cross-origin requests.


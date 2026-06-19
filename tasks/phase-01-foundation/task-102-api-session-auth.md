# Task 102: API Session Management

## Goal
Implement session creation and security middlewares using signed cookies.

## Scope
Create session establishment route and session signature verification middlewares inside `apps/api`.

## Files Expected To Change
* `apps/api/src/middleware/session.ts`
* `apps/api/src/routes/session.ts`
* `apps/api/src/app.ts`

## Dependencies
* Task 101 (Database Schema)

## Acceptance Criteria
* Middleware intercepts requests and creates a cryptographically signed cookie with 24h sliding expiration if not present.
* The cookie uses flags: `httpOnly`, `Secure`, `SameSite=Lax`.
* Valid sessions result in a corresponding row created in the database `sessions` table.

## Validation Steps
1. Run local API server.
2. Make HTTP request with no cookie. Assert `Set-Cookie` header is present in the response containing signature.
3. Assert a corresponding row exists in the PostgreSQL `sessions` table.
4. Modify cookie content and request again. Assert the server returns signature verification error.

## Definition Of Done
* Cookie middleware is written and bound.
* Local API server returns signed session cookie on first load.

# Task 102: API Session Management

## Goal
Implement session creation and security middlewares using signed cookies in TypeScript Express.

## Scope
Create session establishment route and session signature verification middlewares inside `apps/api` using Prisma Client.

## Files Expected To Change
* `apps/api/src/middleware/session.ts`
* `apps/api/src/routes/session.ts`
* `apps/api/src/app.ts`
* `apps/api/package.json`

## Dependencies
* Task 101 (Database Schema via Prisma ORM)

## Acceptance Criteria
* Middleware intercepts requests and creates a cryptographically signed cookie with 24h sliding expiration if not present.
* The cookie uses flags: `httpOnly`, `Secure`, `SameSite=Lax`.
* Valid sessions result in a corresponding row created in the database `sessions` table using the Prisma Client.
* Session signatures are verified using an HMAC token signature.

## Validation Steps
1. Run local Express API server.
2. Make HTTP request with no cookie. Assert `Set-Cookie` header is present in the response containing signature.
3. Assert a corresponding row exists in the PostgreSQL `sessions` table.
4. Modify cookie content and request again. Assert the server returns a signature verification/authentication error (HTTP 401).

## Definition Of Done
* Cookie middleware is written and bound.
* Local API server returns signed session cookie on first load.

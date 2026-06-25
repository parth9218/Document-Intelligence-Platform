# Task 107: Session Auto-Initialization Refactor

## Goal
Update the session retrieval endpoint behavior to automatically initialize and return a new session when the session cookie is missing.

## Scope
Modify the route controller and middleware handling for `GET /api/session` inside `apps/api` to auto-initialize sessions when session cookies are not provided, leveraging the existing session middleware.

## Files Expected To Change
* `apps/api/src/routes/session.route.ts`
* `apps/api/src/controllers/session.controller.ts`
* `apps/api/src/middleware/session.ts`
* `apps/api/src/tests/session.test.ts`

## Dependencies
* Task 102 (API Session Management)

## Acceptance Criteria
* Requesting `GET /api/session` with a missing session cookie must automatically invoke the session generation middleware to create a new session, persist it in the database, return the session details in the response body, and append a signed `Set-Cookie` header.
* Requesting `GET /api/session` with a valid active session cookie must return the existing session details and slide its expiration by 24 hours.
* Requesting `GET /api/session` with a tampered or invalid signature session cookie must continue to return an HTTP 401 Unauthorized error.
* Response schemas for both auto-initialized and pre-existing session requests must remain identical.
* The frontend authentication hook should no longer need to execute explicit session creation requests on receipt of a missing cookie.

## Validation Steps
1. Request `GET /api/session` with no cookie. Assert that response returns HTTP 200 containing a valid session object and is accompanied by a signed `Set-Cookie` header.
2. Verify in the PostgreSQL `sessions` table that a corresponding session record has been inserted.
3. Request `GET /api/session` using the newly issued cookie. Assert that response returns HTTP 200 with the same session details, and its expiration has been extended by 24 hours.
4. Request `GET /api/session` with a tampered cookie value. Assert that the server rejects the request with HTTP 401 Unauthorized.

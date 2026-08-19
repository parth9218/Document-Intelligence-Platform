# Task 108: Express API CORS Configuration

## Goal
Implement a secure, environment-driven Cross-Origin Resource Sharing (CORS) policy middleware in the Express API backend to allow cross-origin credentialed requests in both development and production.

## Scope
* Configure a CORS middleware (such as `cors`) globally in the Express server (`apps/api/src/app.ts`).
* Make the middleware environment-aware:
  - In **development** or **test** environments (`NODE_ENV=development` or `NODE_ENV=test`), dynamically allow cross-origin requests from any requesting origin by reflecting the request's `Origin` header in the `Access-Control-Allow-Origin` response header.
  - In **production** environment (`NODE_ENV=production`), only allow cross-origin requests if the request's `Origin` matches the configured `CORS_ALLOWED_ORIGIN` environment variable. If it does not match, reject the request or omit CORS headers.
* Enforce `Access-Control-Allow-Credentials: true` in all cases to support secure session cookies.
* Support all required API methods: `GET`, `POST`, `PUT`, `DELETE`, and `OPTIONS` (for preflight requests).
* Support explicit allowed headers: `Content-Type`, `Cookie`, `Authorization`.
* Configure preflight request caching via `Access-Control-Max-Age` set to 86400 seconds (24 hours).

## Files Expected To Change
* `apps/api/src/app.ts`

## Dependencies
* Task 102 (API Session Management)

## Acceptance Criteria
* The API server correctly allows cross-origin requests with credentials enabled (`Access-Control-Allow-Credentials: true`).
* In `development` mode:
  - Any origin sending requests (e.g. `http://localhost:3001` or `http://localhost:3000`) is allowed, and its exact origin is reflected in the `Access-Control-Allow-Origin` response header.
  - Preflight `OPTIONS` requests respond with a `204 No Content` or `200 OK` with correct CORS headers.
* In `production` mode:
  - If `CORS_ALLOWED_ORIGIN` is configured (e.g., `https://docintel.domain.com`), only requests matching that origin receive the corresponding `Access-Control-Allow-Origin` header.
  - Requests from other origins do not receive CORS authorization headers, causing browsers to reject them.
* The wildcard origin `*` is **never** returned as the value of `Access-Control-Allow-Origin` when credentials are enabled.

## Validation Steps
1. Start the API server locally in development mode (`NODE_ENV=development`). Issue a `curl` request with an arbitrary `Origin` header (e.g. `Origin: http://another-site.com`) and verify that `Access-Control-Allow-Origin` matches that origin and `Access-Control-Allow-Credentials` is `true`.
2. Issue an `OPTIONS` preflight request and verify that allowed methods and headers are returned, and `Access-Control-Max-Age` is set to `86400`.
3. Start the API server in production mode (`NODE_ENV=production`) with `CORS_ALLOWED_ORIGIN=https://myapp.com`. Issue a request with `Origin: https://myapp.com` and assert that the CORS headers are returned.
4. Issue a request with `Origin: http://untrusted-site.com` and verify that the `Access-Control-Allow-Origin` header is NOT returned in the response.

## Definition Of Done
* CORS middleware is globally registered in `app.ts`.
* CORS validation behavior is environment-driven and uses the `CORS_ALLOWED_ORIGIN` configuration in production.
* Preflight caching and credentials support are fully functional and verified via tests.

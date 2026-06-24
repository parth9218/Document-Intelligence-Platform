# Task 106: Dynamic API Specification Generation

## Goal
Integrate automated, code-driven OpenAPI/Swagger specification generation and hosting into the Express API codebase to expose interactive docs and prevent documentation drift.

## Scope
* Configure a documentation generator framework (such as `swagger-jsdoc` and `swagger-ui-express`) inside the Express API (`apps/api`).
* Annotate all currently implemented Express routes using JSDoc OpenAPI specifications to match the session-scoped endpoints on the `dev` branch:
  * `GET /health` (Health Check)
  * `GET /api/session` (Retrieve Active Session Info)
  * `POST /api/documents` (Initialize Batch Document Upload)
  * `POST /api/documents/:id/confirm-upload` (Confirm Upload Complete)
  * `GET /api/documents/status` (Get Session Documents Status - Polling Fallback)
  * `GET /api/documents/progress` (Real-Time Progress Stream - SSE)
* Serve the interactive API documentation UI at `GET /api-docs` on the server in non-production environments.
* Implement a command in `package.json` to export the generated OpenAPI specification to a static JSON file (e.g. `docs/context/api-specification.json`) for CI/CD checks and frontend consumption.

## Files Expected To Change
* `apps/api/package.json`
* `apps/api/src/app.ts`
* `apps/api/src/routes/documents.route.ts`
* `apps/api/src/routes/session.route.ts`
* New configuration file: `apps/api/src/config/swagger.ts`
* New script file: `apps/api/src/scripts/generate-openapi.ts`

## Dependencies
* Task 101, Task 102, Task 103, and Task 105 (requires the session-scoped status and progress stream endpoints from the `dev` branch).

## Acceptance Criteria
* The Express server serves an interactive Swagger UI page at `GET /api-docs` when running in `development` or `test` node environments.
* The API UI correctly documents cookie authentication parameters (`session_token`), request bodies, success schemas (matching the unified `DocumentStatusObject`), and validation/error status responses for all active endpoints.
* A build/generate command `npm run api:docs:generate` successfully executes and outputs a valid OpenAPI 3.0.0 JSON specification file matching the active implementation.
* Specifications are dynamically generated from inline JSDoc annotations to prevent documentation drift as handlers evolve.
* Accessing `GET /api-docs` in the `production` environment returns a `404 Not Found` or `403 Forbidden` response to secure production interfaces.

## Validation Steps
1. Start the API server locally (`npm run dev`).
2. Navigate to `http://localhost:3000/api-docs` in the browser and assert that the interactive Swagger UI renders.
3. Run `npm run api:docs:generate` and verify that the output specification parses cleanly in Swagger Editor without validation warnings.
4. Set `NODE_ENV=production` and assert that accessing `GET /api-docs` returns a `404 Not Found` or `403 Forbidden` response.

## Definition Of Done
* Swagger configuration is merged and interactive UI is hosted.
* Generating command runs successfully.
* All existing endpoints are annotated and verified.

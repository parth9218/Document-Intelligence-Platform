# Current State Registry

This document records the exact state of code modules and active tasks. Update it after every coding cycle.

## Current Code State

- **API Service (`/apps/api`)**: Refactored into a production-grade modular architecture. Enforces separation of concerns via Routes, Controllers, Services, and structural Validators. Configured with a central environment-aware configuration module (`config/`), custom HTTP/business error classes (`errors/`), centralized Express error handler middleware, and a structured logger (`utils/logger.ts`) producing JSON in production and colorized text in development. File validation supports central configurations and easily extensible MIME types following the Open/Closed Principle. DB interactions leverage pgPool connection pooling (SSE streams) and Prisma transactions (batch upload metadata initializations & confirm-upload status updates). Scheduled cleanup daemon handles expired and stuck uploads. **SSE and status endpoints are fully refactored to session-scoped equivalents (`GET /api/documents/progress`, `GET /api/documents/status`) per ADR-017, using session-scoped PG NOTIFY channels.**
- **Worker Service (`/apps/worker`)**: Not started (boto3 Python / SQLAlchemy). Directory does not exist yet.
- **Frontend Service (`/apps/frontend`)**: Scaffolded using Next.js App Router (TypeScript + Tailwind CSS v4). Setup dependencies, hybrid MSW interception router, HSL variables theme engine, global Layout with Outfit/JetBrains fonts, and custom glassmorphic components. Completed accessibility audits and optimized font sizes/color contrast values across light/dark themes, aligned onboarding structures, and disabled floating/bouncing transitions. All assets build cleanly under Turbopack. Added `suppressHydrationWarning` to both the `<html>` and `<body>` tags in [layout.tsx](file:///Users/parth/RAG/Document%20Intelligence%20Platform/apps/frontend/src/app/layout.tsx) to resolve React hydration mismatch warnings. Conditionally hide the "Sandbox UI" tab and the "Swagger API Docs" link in the sidebar in production mode (`process.env.NODE_ENV === 'production'`). Updated [dev-toolbar.tsx](file:///Users/parth/RAG/Document%20Intelligence%20Platform/apps/frontend/src/components/dev-toolbar.tsx) to adjust to theme modes dynamically and use fully opaque, theme-aware backgrounds (`bg-card`), preventing background text from bleed-through. Cleaned up manual `NODE_ENV` settings from environment files to let Next.js handle build-time environment states natively. Implemented queue controller hook `useUpload.ts` and integrated it with `<UploadZone />` on the main dashboard (`page.tsx`) with concurrent slot pooling limits (max 5 parallel uploads), inline error formatting for rejected files, and custom glassmorphic dialog modals for displaying batch quota/concurrency errors. Created standard `s3-uploader.ts` multipart FormData direct S3 upload engine using `XMLHttpRequest` to capture `onprogress` updates, integrating it with the concurrent orchestrator queue to trigger backend upload confirmation updates upon successful file transmission. Implemented EventSource wrapper `sse-client.ts` to connect to `GET /api/documents/progress` with custom listeners for `snapshot` and `update` events, and implemented hook `useIngestion.ts` to manage real-time progress updates with a 3-second fallback polling loop and automatic connection tear-down once all documents reach terminal states. Created modular layout components `document-card.tsx` and `processing-feed.tsx` to display real-time status cards, granular phase progress indicators, and warning glows with dismiss/retry buttons for failed and expired documents, refactoring the main dashboard `page.tsx`.
- **Infrastructure (`/infra/terraform`)**: Not started. Directory does not exist yet.

## Execution Progress

- **Refined Architecture & Diagrams**: Completed. Specifications added for Retrieval Q&A, SSE streams, PG LISTEN/NOTIFY, and UI progress bars.
- **Ingestion Flow Brainstorm & Pre-Implementation Review**: Completed. Full ingestion pipeline reviewed and corrections applied. See `docs/context/ingestion-flow-decisions.md`.
- **Task Specifications Updated (Phase 1 & 2)**: Completed. Tasks 101, 103, 104, 201, 202, 203 updated with implementation-level detail.
- **Backend Phase 1 (Foundation)**: In Progress. Tasks 101, 102, 103, 105, 106, and 107 are complete; Task 108 (CORS Configuration) is planned. Next is Task 104 (SQS Consumer Loop).
- **Frontend Phase 1 (Foundation)**: Complete. Tasks F1.1, F1.2, and F1.3 are complete.
- **Frontend Phase 2 (Application Shell & API)**: Complete. Tasks F2.1, F2.2, and F2.3 are complete.
- **Frontend Phase 3 (Batch Upload & Ingestion)**: Complete. Tasks F3.1, F3.2, and F3.3 are complete.
- **Frontend Phase 4 (Real-Time Ingestion Progress)**: Complete. Tasks F4.1 and F4.2 are complete.
- **Phase 2 (Ingestion)**: Pending.
- **Phase 3 (Query Engine)**: Pending.
- **Phase 4 (Observability)**: Pending.
- **Phase 5 (Platform)**: Pending.

## Operational Warnings

- Ensure local Docker runs pgvector before implementing Task 101.
- Verify local environment variables avoid colliding with AWS profile parameters.
- The PG NOTIFY trigger on `processing_jobs` must be appended to the Prisma-generated migration SQL — it cannot be expressed in `schema.prisma` directly.
- `EMBEDDING_PROVIDER=local` env var switches worker embedding from Bedrock to Sentence-Transformers. Must be set in local `.env` during development.
- SQLAlchemy models in `apps/worker/models.py` must be manually kept in sync with Prisma schema changes. Prisma Migrate is the single source of truth.
- SQS visibility timeout is 600 seconds (10 min). Adjust if processing times exceed this during testing.

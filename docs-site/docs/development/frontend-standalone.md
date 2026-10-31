---
title: "Frontend Client Standalone Guide"
description: "Local development setup, Mock Service Worker (MSW) emulation, hybrid routing modes, and static export validation for the Next.js client."
---

# Frontend Client Standalone Guide

> Comprehensive operational guide for running, mocking, configuring, and validating the Next.js 16 Single Page Application independently.

---

## Prerequisites & Installation

Before running the frontend independently, ensure you have:

- **Node.js**: Version 20 or 24 LTS.
- **npm**: Version 10 or 11.
- **Dependencies**: Install from the `apps/frontend` directory:
    - Command: `npm install`

---

## Tri-Mode API Architecture

The frontend supports three distinct execution modes controlled via `NEXT_PUBLIC_API_MODE`:

| Execution Mode | Setting | Operational Characteristics | Backend Dependency |
| :--- | :--- | :--- | :--- |
| **Standalone Mock Mode** | `NEXT_PUBLIC_API_MODE=mock` | Intercepts all network traffic via MSW. Simulates session authorization, presigned upload URLs, real-time SSE progress, and Q&A chat streaming. | **Zero** (no Docker, no database, no API required) |
| **Full Live Mode** | `NEXT_PUBLIC_API_MODE=api` | Routes all API requests directly to the live Express server (`http://localhost:3000`) and uploads to LocalStack/S3. | Requires full backend stack running |
| **Hybrid Mode** | `NEXT_PUBLIC_API_MODE=hybrid` | Default development mode. Renders the floating `<DevToolbar />` in the browser, allowing developers to toggle between live and mock endpoints on the fly. | Optional (graceful fallback) |

### Standalone Mocking with MSW
In mock mode, `public/mockServiceWorker.js` intercepts browser `fetch` requests:

- Returns realistic session tokens and CSRF cookies.
- Simulates multi-file upload progress and server-side processing transitions (`queued` -> `downloading` -> `chunking` -> `completed`).
- Streams chunked markdown responses for RAG queries with synthetic citation markers (`[1]`, `[2]`).

---

## Decoupled Runtime Configuration (`config.js`)

To prevent the anti-pattern of rebuilding JavaScript bundles for each environment, the frontend decouples configuration from compilation:

- **Resolution Hierarchy**: `window.__APP_CONFIG__` -> `process.env.NEXT_PUBLIC_*` -> relative path `/api`.
- **Local Development**: Reads `public/config.js` (injected via blocking script in `index.html`) or `.env.development`.
- **Production Deployment**: CloudFront serves a dynamically generated `config.js` written to S3 by the deployment pipeline, preserving identical static artifacts across staging and production.

---

## Standalone Development Commands

### 1. Launch Local Development Server
Starts the Next.js development server on port 3001 using development environment variables:

- Command: `npm run dev:local`
- Access in browser: `http://localhost:3001`

### 2. Launch with Production Settings
Starts the development server loading `.env.production` (simulating relative API routing):

- Command: `npm run dev:prod`

### 3. Verify Static Compilation (`next build`)
Validates that all pages compile to static HTML and client bundles without server-side rendering errors:

- Command: `npm run build`
- Outputs compiled static assets to `out/`.

### 4. Code Quality & Linting
Runs ESLint against Next.js and TypeScript rules:

- Command: `npm run lint`

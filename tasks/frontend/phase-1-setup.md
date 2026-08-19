# Frontend Phase 1 Tasks: Foundation, Tailwind & Hybrid Mocking

This file details the tasks required to build the frontend foundation, Tailwind CSS configs, and the hybrid API/mock routing engine.

---

## Task F1.1: Next.js Workspace Scaffolding & Core Configurations

### Goal
Initialize the Next.js workspace in `apps/frontend/` with App Router, strict TypeScript, and the base dependency matrix.

### Scope
Create the application directory under `apps/frontend/` containing `tsconfig.json`, base configurations, package.json, and alias rules.

### Files Expected To Change
* New directory: `apps/frontend/` and its children (e.g. `package.json`, `tsconfig.json`, `next.config.js`).

### Dependencies
* None.

### Acceptance Criteria
* The Next.js template builds cleanly without type errors via `npm run build`.
* Alias mappings configured in `tsconfig.json` for mapping `src/*` to `@/*`.
* Necessary node dependencies added: `zustand`, `lucide-react`, `msw`, `clsx`, `tailwind-merge`.
* Clear template folders and establish baseline workspace structure.

### Validation Steps
1. Navigate to `/apps/frontend` and run `npm run build`. Confirm that the build finishes with a code 0.
2. Confirm `tsconfig.json` contains alias parameters `@/*` pointing to `src/*`.

### Definition Of Done
* Baseline Next.js workspace is created, and packages are installed.

---

## Task F1.2: Hybrid API Router & MSW Interception Engine

### Goal
Implement a configuration-based API client gateway that allows toggling each service endpoint dynamically between native backend APIs and Mock Service Worker (MSW) handlers.

### Scope
Create the hybrid route configuration module, the global gateway fetch client, and configure local MSW interception files under `apps/frontend/src/mocks/`.

### Files Expected To Change
* `apps/frontend/src/config/api-routing.ts`
* `apps/frontend/src/lib/api-client.ts`
* `apps/frontend/src/mocks/handlers.ts`
* `apps/frontend/src/mocks/browser.ts`

### Dependencies
* Task F1.1

### Acceptance Criteria
* **Granular Route Settings**: `src/config/api-routing.ts` maps `'api' | 'mock'` states for domains: `session`, `documents`, `progress`, and `query`.
* **API Wrapper**: `src/lib/api-client.ts` proxies fetch calls to MSW handlers or actual API routes based on `api-routing.ts`.
* **Mock Interceptors**: MSW handlers in `src/mocks/handlers.ts` intercept targets and return simulated payloads with configurable processing latency.
* **Environment Override**: Standardized override mapping of the toggle parameters via `NEXT_PUBLIC_API_MODE=hybrid|mock|api`.

### Validation Steps
1. Toggle `api-routing.ts` session endpoint to `'mock'` and query session data. Verify that MSW returns the mocked session UUID payload.
2. Toggle `api-routing.ts` session endpoint to `'api'` and verify the client makes an actual fetch request to `http://localhost:3000/api/session`.

### Definition Of Done
* MSW is configured, and endpoints can be dynamically toggled individually or globally.

---

## Task F1.3: Reusable Tailwind UI & Theme System

### Goal
Configure the Tailwind CSS framework variables to support liquid-glass filters and compile accessible UI widgets.

### Scope
Create global styles, custom style configurations in `tailwind.config.ts`, and core widgets in `src/components/ui/`.

### Files Expected To Change
* `apps/frontend/src/app/globals.css`
* `apps/frontend/tailwind.config.ts`
* `apps/frontend/src/components/ui/button.tsx`
* `apps/frontend/src/components/ui/card.tsx`
* `apps/frontend/src/components/ui/progress-bar.tsx`
* `apps/frontend/src/components/ui/toast.tsx`

### Dependencies
* Task F1.2

### Acceptance Criteria
* **Design Tokens**: `tailwind.config.ts` includes HSL color mappings for dark/light themes (Sapphire, Cyan Glow, Violet, Slate gray background) and custom glassmorphism utilities (`backdrop-blur-md`).
* **Interactive Button**: Supports disabled locks, loading states, and hover animation scales.
* **Card Widget**: Features translucent overlays, thin gradient borders, and responsive shadows.
* **ProgressBar**: Smoothly updates width. Interpolates colors based on step (amber for uploading, cobalt for ingestion, emerald for success).
* **Toast Handler**: Exposes accessibility-compliant popup blocks containing timeout rules.

### Validation Steps
1. Load UI components under a local development sandbox page.
2. Verify visual rendering changes when toggling `data-theme` parameter on the root `<html>` element.

### Definition Of Done
* Tailwind is configured, and global baseline widgets compile successfully.

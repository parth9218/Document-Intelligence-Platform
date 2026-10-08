# Task 503: Frontend Runtime Configuration Decoupling (`config.js`)

## 1. Goal

Decouple environment-specific runtime configurations (`API_URL`, `API_MODE`, `APP_VERSION`) from Next.js compile-time static inlining (`process.env.NEXT_PUBLIC_*`), enabling an immutable "Build once in dev, promote artifact to stg/prod" strategy across `dev`, `stg`, and `prod` while preserving seamless local testing.

---

## 2. Prerequisites & Dependencies

- Architecture Decisions: Multi-Environment Tag-Driven Release Strategy & Build-Once Promotion
- Frontend Workspace: `apps/frontend/` (Next.js 16 App Router, static export `output: 'export'`)
- Related Specification: [infrastructure-cicd-spec.md](docs/context/infrastructure-cicd-spec.md)
- Downstream Dependency: [Task 504: Multi-Environment Frontend CI/CD Pipeline](tasks/phase-05-cicd/task-504-frontend-cicd-pipeline.md)

---

## 3. Background & Architectural Rationale

In Next.js with static HTML export (`output: 'export'`), environment variables prefixed with `NEXT_PUBLIC_*` are statically evaluated and inlined as literal strings into the compiled JavaScript chunks during `next build`. Consequently, changing `NEXT_PUBLIC_API_URL` traditionally requires re-compiling the entire application bundle for each target environment, violating 12-factor application principles and breaking cross-environment artifact promotion.

To achieve true runtime decoupling:

1. The application will load an un-hashed, lightweight script `/config.js` prior to application hydration.
2. `/config.js` initializes `window.__APP_CONFIG__`.
3. Client services read configuration dynamically from `window.__APP_CONFIG__`, falling back to `process.env.NEXT_PUBLIC_*` or sensible defaults for local development.
4. During deployment, the CI/CD pipeline overwrites `config.js` on S3 for each environment without touching or rebuilding the pre-compiled application bundle.

---

## 4. Scope of Modifications

### 4.1 Global TypeScript Declarations (`apps/frontend/src/types/config.d.ts`)

Create a type declaration file defining the `AppConfig` interface and extending the global `Window` object:

```typescript
export interface AppConfig {
  API_URL?: string;
  API_MODE?: "api" | "mock" | "hybrid";
  APP_VERSION?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppConfig;
  }
}
```

---

### 4.2 Generic Local Configuration Template (`apps/frontend/public/config.js`)

Create a default, generic `config.js` in the `public/` directory so that Next.js serves it during `next dev` and bundles it into `out/` during `next build`:

```javascript
// Generic local development / fallback configuration
// In deployed environments, this file is dynamically generated and overwritten on S3 by the CI/CD pipeline.
window.__APP_CONFIG__ = {
  API_URL: "",
  API_MODE: "hybrid",
  APP_VERSION: "0.0.0",
};
```

---

### 4.3 Script Injection in Root Layout (`apps/frontend/src/app/layout.tsx`)

Inject the configuration script using Next.js's native `<Script>` component with `strategy="beforeInteractive"` inside `apps/frontend/src/app/layout.tsx`:

```tsx
import Script from "next/script";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          src="/config.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="...">
        {children}
      </body>
    </html>
  );
}
```

> **Why `strategy="beforeInteractive"` is required:**
> In Next.js App Router, `strategy="beforeInteractive"` guarantees that the script is injected directly into the initial server/static HTML `<head>` and executed **synchronously before any Next.js client runtime code, page hydration, or component lifecycle hooks execute**. This prevents race conditions where API clients or stores evaluate before `window.__APP_CONFIG__` is initialized.

---

### 4.4 Refactor Frontend Configuration Consumers

#### 1. API Client (`apps/frontend/src/lib/api-client.ts`)

Update the backend URL resolution to prioritize runtime configuration:

```typescript
const BACKEND_URL =
  (typeof window !== "undefined" && window.__APP_CONFIG__?.API_URL) ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000";
```

#### 2. API Routing Configuration (`apps/frontend/src/config/api-routing.ts`)

Update the default mode resolution:

```typescript
const defaultMode = ((typeof window !== "undefined" &&
  window.__APP_CONFIG__?.API_MODE) ||
  process.env.NEXT_PUBLIC_API_MODE ||
  "hybrid") as "api" | "mock" | "hybrid";
```

#### 3. Dev Toolbar (`apps/frontend/src/components/dev-toolbar.tsx`)

Update fallback mode logic to reference `window.__APP_CONFIG__?.API_MODE` consistently with `api-routing.ts`.

---

### 4.5 Universal Build Script (`apps/frontend/package.json`)

Consolidate build scripts to use a single, environment-agnostic command:

- Update `"build"`: `"next build"`
- Retain local dev convenience script `"dev:local"` using `env-cmd -f .env.development next dev -p 3001`.
- Remove or deprecate `"build:prod"` and `"build:local"` in favor of the universal `"build"` command.

---

## 5. Local Verification & Testing

1. **Local Development Parity**:
   - Run `npm run dev:local` in `apps/frontend`.
   - Verify the browser loads `/config.js` without 404 errors.
   - Verify `window.__APP_CONFIG__` is available in DevTools console.
   - Verify API requests route to `http://localhost:3000` (or local MSW) as expected.
2. **Build Output Verification**:
   - Run `npm run build` in `apps/frontend`.
   - Assert build succeeds cleanly with exit code 0.
   - Verify `apps/frontend/out/config.js` exists in the exported bundle.
3. **Runtime Overwrite Verification**:
   - Manually edit `apps/frontend/out/config.js` to set `API_URL: "https://custom-test.example.com/api"`.
   - Serve `out/` via local static server (`npx serve apps/frontend/out`).
   - Inspect network calls in browser to confirm the application immediately targets `https://custom-test.example.com/api` without rebuilding the JS bundle.

---

## 6. Acceptance Criteria

- [x] `apps/frontend/src/types/config.d.ts` extends global `Window` with `__APP_CONFIG__`.
- [x] `apps/frontend/public/config.js` exists with generic default values.
- [x] `apps/frontend/src/app/layout.tsx` includes `<Script src="/config.js" strategy="beforeInteractive" />`.
- [x] `api-client.ts`, `api-routing.ts`, and `dev-toolbar.tsx` resolve runtime values before environment fallbacks.
- [x] `package.json` provides a single universal `"build": "next build"` command.
- [x] Local dev mode (`npm run dev:local`) runs without errors or missing config warnings.
- [x] Static export (`npm run build`) builds cleanly into `out/` with zero TypeScript or linting errors.

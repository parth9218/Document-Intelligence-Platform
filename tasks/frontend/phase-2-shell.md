# Frontend Phase 2 Tasks: Shell, Session & API Layer

This file details the tasks required to build the global application layout, handle session initialization, configure the API client wrapper, and layout the dashboard.

---

## Task F2.1: API Integration Client & Error Schema Adapter

### Goal
Configure the fetch API gateway wrapper to pass session tokens and parse structural API error codes.

### Scope
Build the client adapter methods, parse CORS headers, and create error mapping structures.

### Files Expected To Change
* `apps/frontend/src/lib/api-client.ts`
* `apps/frontend/src/types/api.d.ts`

### Dependencies
* Task F1.3, Task 106 (Backend Spec)

### Acceptance Criteria
* **Signed Cookie Forwarding**: API Client is configured with `credentials: 'include'` to pass session tokens.
* **Error Mapper**: Intercepts error status codes and parses them into customized error objects mapping to `ErrorResponse` (identifying `unauthorized`, `storage_quota_exceeded`, `rate_limit_exceeded`).
* **Developer Controls**: Setup a dev-only floating toolbar widget enabling developers to change endpoint modes (`'api'` or `'mock'`) on the fly.

### Validation Steps
1. Route queries through `api-client`. Assert that outgoing HTTP headers contain cookies.
2. Trigger API failures (e.g. 400 upload quota error). Assert the client extracts details and maps them to structured error messages.

### Definition Of Done
* Core API wrapper is configured to transmit session cookies and handle API failure states.

---

## Task F2.2: Session Verification & Auth Shell

### Goal
Build the `useAuth` session hook and configure the main layout.

### Scope
Create user session checks, redirect workflows, and the navigation sidebar.

### Files Expected To Change
* `apps/frontend/src/hooks/useAuth.ts`
* `apps/frontend/src/components/layout/sidebar.tsx`
* `apps/frontend/src/components/layout/header.tsx`
* `apps/frontend/src/app/layout.tsx`

### Dependencies
* Task F2.1, Task 102 (Backend Session API)

### Acceptance Criteria
* **Auth Hook**: `useAuth` queries session details on load. If the API returns `401 Unauthorized` and routing mode is `'api'`, trigger a session creation request.
* **App Shell Layout**: Set up global responsive frames with collapsable sidebar navigation, session status headers showing truncated UUIDs, and a system theme switcher.
* **Store Integration**: Update Zustand store `activeSession` details when auth transitions.

### Validation Steps
1. Load dashboard. Verify that session creation triggers automatically, establishing a cookie.
2. Confirm clicking sidebar toggle collapses panels with fluid transitions.

### Definition Of Done
* Global responsive sidebar and header are created, and user session cookies initialize successfully.

---

## Task F2.3: Dashboard Homepage & Empty States

### Goal
Configure the dashboard homepage layout and render empty-state user onboarding views.

### Scope
Design the dashboard index layout, panels, and onboarding state components.

### Files Expected To Change
* `apps/frontend/src/app/page.tsx`
* `apps/frontend/src/components/documents/empty-state.tsx`

### Dependencies
* Task F2.2

### Acceptance Criteria
* **Responsive Layout Grid**: Main panel grid organizes the file picker widget, processing feed tracking panels, and file records list.
* **Glassmorphic Empty State**: If no files exist in the session registry, hide feed boards and render a guide walkthrough illustrating upload guidelines (file sizes <= 5MB, concurrent max 5 uploads, total 50MB storage quota).

### Validation Steps
1. Clear the Zustand registry and verify the onboarding layout renders.
2. Test responsive folding under mobile browser viewport simulations.

### Definition Of Done
* Dashboard index layout and onboarding guidelines compile cleanly.

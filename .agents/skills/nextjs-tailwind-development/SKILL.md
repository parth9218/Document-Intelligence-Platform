# Next.js + Tailwind CSS Development Skill

## Purpose

This skill provides implementation standards, architectural guidance, and development conventions for building and maintaining frontend applications using:

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- React
- Server Components
- Client Components
- Modern UI/UX patterns

Use this skill whenever creating or modifying frontend functionality.

---

# Core Principles

## Prioritize Simplicity

Prefer:

- Simple components
- Simple state management
- Simple data flow

Avoid:

- Premature abstractions
- Generic component factories
- Over-engineering

---

## Strong Type Safety

Always:

- Use TypeScript
- Define interfaces and types
- Avoid `any`
- Prefer explicit types

Bad:

```ts
const response: any;
```

Good:

```ts
interface DocumentResponse {
  id: string;
  status: string;
}
```

---

## Server First

Default to:

- Server Components

Use Client Components only when required.

Examples:

- User interaction
- Browser APIs
- SSE
- Theme switching
- Local state

---

## Colocation

Keep related files together.

Example:

```text
src/app/documents/

├── page.tsx
├── loading.tsx
├── error.tsx
├── _components/
├── _hooks/
└── _lib/
```

---

# Project Structure

```text
src/

├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── documents/
│   └── upload/
├── hooks/
├── lib/
│   ├── api/
│   ├── sse/
│   ├── validations/
│   └── utils/
├── providers/
├── types/
├── constants/
└── styles/
```

---

# App Router Guidelines

Use:

```text
app/
```

Avoid:

```text
pages/
```

---

## Route Organization

Example:

```text
app/

├── page.tsx
├── documents/
│   ├── page.tsx
│   └── [documentId]/
│       └── page.tsx
└── upload/
    └── page.tsx
```

---

# Component Design

## Component Categories

### UI Components

Reusable presentation components.

Examples:

```text
Button
Card
Badge
Progress
Dialog
```

No business logic.

---

### Feature Components

Contain feature-specific logic.

Examples:

```text
UploadArea
DocumentProgressCard
DocumentList
```

---

### Layout Components

Examples:

```text
Navbar
Sidebar
Footer
PageShell
```

---

# Tailwind Guidelines

## Utility First

Prefer Tailwind utilities.

Avoid large CSS files.

Bad:

```css
.document-card {
  ...
}
```

Good:

```tsx
<div className="rounded-xl border p-4">
```

---

## Extract Only When Repeated

Create reusable components only after repetition is proven.

---

# Theme System

Support:

- Light
- Dark
- System

Required:

```text
next-themes
```

Use CSS variables.

Example:

```css
--background
--foreground
--border
--primary
```

Never hardcode colors throughout components.

---

# Design Language

Target:

- Modern SaaS
- Glassmorphism
- Clean spacing
- Minimal clutter

Characteristics:

- Soft borders
- Subtle shadows
- Blur effects
- Smooth transitions

Avoid:

- Excessive animations
- Excessive gradients
- Excessive visual noise

---

# State Management

## Preferred Order

### URL State

First choice.

Example:

```text
?documentId=123
```

---

### React State

Second choice.

```tsx
useState();
```

---

### Context

Only for shared application concerns.

Examples:

```text
Theme
Session
Notifications
```

---

### External State Libraries

Avoid unless clearly justified.

Do not introduce:

- Redux
- MobX
- Zustand

without documented justification.

---

# API Layer

All API interactions must go through:

```text
src/lib/api/
```

Example:

```text
src/lib/api/documents.ts
src/lib/api/upload.ts
src/lib/api/chat.ts
```

Never call APIs directly inside UI components.

---

## API Client Pattern

```ts
export async function getDocuments() {}
export async function uploadDocument() {}
```

UI consumes functions.

---

# Error Handling

Every API interaction must handle:

- Network failure
- Timeout
- Validation failure
- Server error

Provide user-friendly messages.

Never expose raw backend errors.

---

# Loading States

Every async operation requires:

### Loading

Skeleton or progress indicator.

### Success

Clear feedback.

### Failure

Actionable message.

---

# Document Upload UX

Required states:

```text
Waiting
Uploading
Uploaded
Processing
Chunking
Embedding
Complete
Failed
```

Progress must be visible.

---

# SSE Integration

Use SSE for:

```text
Document Processing Progress
```

Requirements:

- Auto reconnect
- Cleanup subscriptions
- Handle disconnects gracefully

Encapsulate inside:

```text
src/lib/sse/
```

---

# Forms

Preferred:

```text
react-hook-form
zod
```

Validation rules:

- Shared schemas
- Typed inputs
- Friendly messages

---

# Accessibility

Required:

- Keyboard navigation
- Focus indicators
- Proper labels
- ARIA attributes where necessary

Never rely solely on color.

---

# Performance

Avoid:

- Unnecessary client components
- Large bundles
- Re-render storms

Use:

```tsx
Suspense
Dynamic imports
Server Components
```

when appropriate.

---

# Testing Expectations

Critical flows:

- Upload
- Progress tracking
- Error handling
- Theme switching

Should be testable.

Prefer:

```text
Vitest
React Testing Library
```

---

# Code Review Checklist

Before completing work verify:

- Type-safe
- Responsive
- Accessible
- Error states handled
- Loading states handled
- Dark mode supported
- No duplicated logic
- API abstraction respected
- Tailwind conventions followed
- Project structure respected

---

# Anti-Patterns

Do not:

- Use `any`
- Create giant components
- Call APIs directly from JSX
- Introduce unnecessary state libraries
- Mix business logic into UI components
- Hardcode colors
- Ignore loading states
- Ignore error states
- Introduce custom CSS when Tailwind suffices

---

# Definition of Done

A frontend task is complete only when:

- Functionality works
- Types are correct
- Responsive behavior works
- Light and dark themes work
- Error handling exists
- Loading states exist
- Accessibility is respected
- Project conventions are followed
- No architectural violations are introduced

# skill.md

## Production-Grade Backend Engineering Standards

### Purpose

This skill defines the minimum engineering standards expected for all backend implementations, refactors, and architectural changes.

Functionality alone is not considered complete. Generated code must also demonstrate maintainability, scalability, extensibility, readability, and production readiness.

---

# Core Principles

Every implementation must optimize for:

- Correctness
- Maintainability
- Extensibility
- Scalability
- Readability
- Testability
- Operational simplicity

Code should be written as though it will be maintained by another senior engineer several years from now.

---

# Architectural Standards

## Separation of Concerns

Never place multiple responsibilities within a single component.

Expected layering:

```text
Routes
  ↓
Controllers
  ↓
Services
  ↓
Repositories / Data Access
  ↓
External Systems
```

### Routes

Responsibilities:

- Endpoint registration
- Middleware composition
- Request delegation

Must not contain:

- Business logic
- Database access
- Complex validation logic

### Controllers

Responsibilities:

- Request parsing
- Response formatting
- Service orchestration

Must not contain:

- Database access
- Business rules
- Infrastructure concerns

### Services

Responsibilities:

- Business logic
- Workflow orchestration
- Domain rules

Should remain framework agnostic whenever possible.

### Repositories

Responsibilities:

- Database interaction
- Query execution
- Persistence concerns

Must not contain:

- Business rules

---

# Configuration Management

## Hardcoded Values

Avoid hardcoded values throughout the codebase.

Examples:

- File size limits
- Retry counts
- TTL values
- Timeouts
- Pagination limits
- Supported file types
- Feature flags

These should be centralized within:

```text
config/
constants/
env/
```

Use environment variables only for deployment-specific values.

Use constants for application rules.

---

# Extensibility Requirements

Implementations must assume future growth.

When a feature supports a collection of values:

Bad:

```js
if (mimeType === "application/pdf")
```

Good:

```js
supportedMimeTypes.includes(mimeType);
```

New functionality should be addable through configuration rather than code modification whenever practical.

Follow Open/Closed Principle.

---

# Validation Standards

Validation must be centralized.

Prefer:

```text
validators/
schemas/
```

Avoid:

- Inline validation in controllers
- Repeated validation logic
- Duplicated schema definitions

Validation rules should be reusable.

---

# Error Handling

All applications must implement centralized error handling.

Requirements:

- Standard error structure
- Consistent status codes
- Meaningful error messages
- Error classification

Preferred hierarchy:

```text
ApplicationError
 ├─ ValidationError
 ├─ AuthenticationError
 ├─ AuthorizationError
 ├─ NotFoundError
 ├─ ConflictError
 └─ InternalServerError
```

Avoid scattered try/catch blocks when centralized handling is possible.

---

# Logging Standards

Never rely on ad-hoc console logging.

Use structured logging.

Logs should support:

- Request tracing
- Error investigation
- Operational monitoring

Log levels:

```text
error
warn
info
debug
```

Sensitive information must never be logged.

---

# File Handling Standards

When implementing file-related functionality:

## Supported Types

Supported file types must be centrally configured.

Example:

```text
constants/file-types.ts
```

Avoid embedding file type checks throughout the application.

## Limits

Maximum sizes and upload constraints must be configurable.

## Storage

Storage implementation should be abstracted.

The application should be able to evolve from:

```text
Local Storage
→ S3
→ Multi-provider Storage
```

with minimal code changes.

---

# Dependency Management

Before introducing a dependency:

Evaluate:

1. Necessity
2. Maintenance quality
3. Security risk
4. Bundle impact
5. Community adoption

Do not add dependencies for trivial functionality.

Prefer platform-native solutions when reasonable.

---

# Code Quality Standards

## Naming

Names must communicate intent.

Avoid:

```text
data
obj
temp
val
result
```

Prefer:

```text
documentMetadata
uploadConfiguration
presignedUrlResponse
```

## Function Size

Functions should perform one responsibility.

Refactor large functions into smaller composable units.

## Duplication

Eliminate duplicated logic.

Extract reusable abstractions when duplication becomes apparent.

---

# Scalability Review Checklist

Before finalizing any implementation, verify:

- Responsibilities are separated.
- No business logic exists in routes.
- No database access exists in controllers.
- Configuration is centralized.
- Validation is reusable.
- Errors are centralized.
- Logging is structured.
- File handling is extensible.
- New feature categories can be added without major rewrites.
- Code follows SOLID principles where appropriate.
- Dead code has been removed.
- Naming is clear and consistent.

---

# Refactoring Expectations

When refactoring:

Do not merely move code between files.

Improve:

- Architecture
- Readability
- Extensibility
- Maintainability
- Consistency

Preserve existing behavior unless a change is clearly justified.

---

# Self-Review Requirement

Before considering implementation complete, perform a critical review:

1. Identify architectural weaknesses.
2. Identify scalability bottlenecks.
3. Identify maintainability concerns.
4. Identify over-engineering.
5. Propose remaining improvements.

The implementation should be capable of passing review by experienced senior engineers without requiring major structural changes.

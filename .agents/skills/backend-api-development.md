# Skill: Backend API Development (Node.js/TypeScript)

## Purpose
Guide agents in writing concurrent, secure, and typed API routes.

## Best Practices
* Enforce strict typing. Do not bypass validations with `any` types.
* Verify incoming payloads using Zod or Joi validators before database writes.
* Clean up request lifecycles. Ensure database connections release back to pool in `finally` blocks.

## Common Mistakes
* Surfacing raw database connection or cloud driver timeout errors to client responses. (Provide clean user-facing error messages instead).
* Missing signature validation checks on cookies.

## Validation Checklist
- [ ] Route handler input values checked against schema limits?
- [ ] Cookies parsed via HMAC signing validation parser?
- [ ] Express routing handlers catch exceptions and forward to global error wrapper?

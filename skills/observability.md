# Skill: Observability & Logging

## Purpose
Integrate OpenTelemetry metrics, log streams, and distributed traces.

## Best Practices
* Format application log output statements as structured JSON objects.
* Inject trace contexts into SQS messages to track distributed execution.
* Expose metrics endpoints for Prometheus scraping.

## Common Mistakes
* Printing stack trace exceptions containing database connection keys or server names to log outputs.
* Generating logs without session IDs, preventing log correlation.

## Validation Checklist
- [ ] Application logs output in JSON?
- [ ] Context headers carry `traceparent` parameters?
- [ ] Prometheus variables present on endpoints?

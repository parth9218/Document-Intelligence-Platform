# Pending Decisions Registry

These decisions are deferred to later project phases.

## 1. Authentication Provider (Deferred to Phase 5)
* **Status**: Open
* **Context**: Need standard OIDC integration (AWS Cognito vs Keycloak).
* **Impact**: Affects API gateway routing rules and session identity tables.

## 2. Ingestion Progress Communication (Deferred to Phase 3)
* **Status**: Open
* **Context**: Deciding between polling every 3 seconds or adding WebSockets.
* **Current Decision**: Polling is selected for v1 to avoid operational complexity.

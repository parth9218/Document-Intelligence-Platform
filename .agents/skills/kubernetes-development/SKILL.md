---
name: kubernetes-development
description: Write Helm charts, configure NetworkPolicies, and apply pod permissions.
---

# Skill: Kubernetes Deployment & Security

## Purpose
Write Helm charts, configure NetworkPolicies, and apply pod permissions.

## Best Practices
* Enforce pod security limits: run containers without root rights (`runAsNonRoot: true`).
* Apply default-deny NetworkPolicies on namespaces. Explicitly open paths for RDS Proxy and Bedrock calls.
* Annotate ServiceAccounts with the correct AWS role values to map IRSA profiles.

## Common Mistakes
* Embedding long-lived AWS programmatic API keys inside container environment variables.
* Running pods without resource requests and limit parameters.

## Validation Checklist
- [ ] Container limits set requests and limit ranges?
- [ ] SecurityContext blocks root access?
- [ ] ServiceAccount name maps to target IRSA roles?

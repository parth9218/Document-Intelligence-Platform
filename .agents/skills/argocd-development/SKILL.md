---
name: argocd-development
description: Automate continuous deployment sync cycles and configure self-healing rules.
---

# Skill: ArgoCD GitOps Workflows

## Purpose
Automate continuous deployment sync cycles and configure self-healing rules.

## Best Practices
* Restrict git repository check-in updates: CI commits image tag updates to separate GitOps configuration repositories.
* Enable ArgoCD self-healing to automatically revert manual modifications.
* Configure sync waves to deploy ConfigMaps and Secrets before workloads.

## Common Mistakes
* Triggering `kubectl apply` commands in CI pipelines.
* Committing raw secrets into public Git repository branches.

## Validation Checklist
- [ ] ArgoCD application points to correct Git source?
- [ ] Sync waves defined?
- [ ] Self-healing active?

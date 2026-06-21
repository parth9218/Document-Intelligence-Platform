# Skill: Helm Chart Configuration

## Purpose
Manage environment values and generate Kubernetes deployment manifests.

## Best Practices
* Decouple values configurations: separate standard application configurations and environment credentials.
* Use Helm linting tools to check format rules.
* Define startup and liveness probes.

## Common Mistakes
* Hardcoding environment parameters inside deployment manifests.
* Leaving default credentials inside `values.yaml` files.

## Validation Checklist
- [ ] values.yaml contains templates for developer overrides?
- [ ] Charts run without warnings in `helm lint` validation checks?
- [ ] Dry-run executions generate valid yaml schemas?

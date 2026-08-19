# Task 402: Helm Chart Packaging

## Goal
Create reusable Helm charts for API and Worker services.

## Scope
Establish `/infra/k8s/helm` templates.

## Files Expected To Change
* `infra/k8s/helm/api/Chart.yaml`
* `infra/k8s/helm/api/values.yaml`
* `infra/k8s/helm/worker/Chart.yaml`
* `infra/k8s/helm/worker/values.yaml`

## Dependencies
None

## Acceptance Criteria
* Setup YAML manifests containing Deployments, ClusterIP Services, ConfigMaps, and PodDisruptionBudgets.
* Link ServiceAccounts annotated with target AWS IAM Role ARNs (IRSA).
* Configure resource limits, liveness and readiness probes.

## Validation Steps
1. Execute `helm lint` against charts.
2. Perform dry-run installs: `helm install --dry-run api-service ./infra/k8s/helm/api`.

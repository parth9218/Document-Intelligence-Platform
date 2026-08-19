# Task 403: ArgoCD GitOps Git Integration

## Goal
Configure ArgoCD application-of-applications templates to automate deployments.

## Scope
Define GitOps declarations tracking values and target states.

## Files Expected To Change
* `infra/k8s/argocd/application.yaml`

## Dependencies
* Task 402 (Helm Charting)

## Acceptance Criteria
* ArgoCD Application tracks Git repository deployment manifest paths.
* Enable automated synchronization with self-healing rules.

## Validation Steps
1. Apply ArgoCD declarations.
2. Assert deployment creates API and Worker workloads successfully.

# Task 505: Kubernetes Security Hardening

## Goal
Apply zero-trust configurations using NetworkPolicies and Kyverno security limits.

## Scope
Configure default-deny NetworkPolicies and Kyverno restriction templates.

## Files Expected To Change
* `infra/k8s/policies/network-policy.yaml`
* `infra/k8s/policies/kyverno-rules.yaml`

## Dependencies
None

## Acceptance Criteria
* Default-deny NetworkPolicies block direct api-to-worker internal connections.
* Allow API pods only from ALB Ingress. Allow worker pods outbound to SQS, S3, RDS.
* Kyverno rules block run-as-root containers and enforce read-only filesystems.

## Validation Steps
1. Apply NetworkPolicies.
2. Attempt direct pod-to-pod API curl execution from worker container. Verify request drops.
3. Validate Kyverno blocks privileged pod storage parameters.

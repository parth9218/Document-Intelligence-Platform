# Task 504: KEDA Autoscaler Configuration

## Goal
Configure Worker scaling based on SQS queue message length.

## Scope
Write KEDA ScaledObject declarations.

## Files Expected To Change
* `infra/k8s/helm/worker/templates/scaledobject.yaml`

## Dependencies
* Task 502 (Helm Charting)

## Acceptance Criteria
* ScaledObject points to main SQS queue.
* Target scaling profile: scales down worker pods to 0 when SQS queue is empty; scales up to 10 replicas.

## Validation Steps
1. Feed SQS queue with 10 messages.
2. Assert KEDA launches worker pods.
3. Clear queue and verify worker pods scale down to zero.

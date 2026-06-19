# Task 501: Infrastructure Provisioning

## Goal
Write Terraform configurations to deploy the target VPC, EKS, RDS Proxy, and IAM resources.

## Scope
Create `/infra/terraform` configurations incorporating network, RDS, and IAM requirements.

## Files Expected To Change
* `infra/terraform/main.tf`
* `infra/terraform/rds.tf`
* `infra/terraform/eks.tf`

## Dependencies
None

## Acceptance Criteria
* VPC config spans 2 AZs containing isolated private subnets.
* RDS PostgreSQL configured with pgvector and RDS Proxy using IAM Auth.
* SQS queue and Dead Letter Queue created.
* S3 buckets configured with KMS-managed encryption keys.

## Validation Steps
1. Execute `terraform validate`.
2. Run `terraform plan` and verify resource graph matches architectural parameters.

# Terraform Infrastructure Specification

## Overview
The infrastructure for the AI Document Intelligence Platform has been fully provisioned using Terraform, adhering to a modular, environment-agnostic architecture.

## Architecture

The `infra/terraform` directory is structured to separate reusable modules from environment-specific instantiations and Kubernetes resource definitions:

- **Modules (`infra/terraform/aws/modules`)**:
  - `acm`: ACM Certificates and TLS configurations.
  - `ecr`: Elastic Container Registries.
  - `eks`: EKS cluster configuration with dedicated node groups (`api-nodes`, `worker-nodes`), EKS Pod Identity Associations.
  - `messaging`: SQS Queues and Dead Letter Queues (DLQs).
  - `oidc`: OIDC Identity Providers for EKS.
  - `secrets`: AWS Secrets Manager and SSM Parameter Store setup for dynamic configuration.
  - `storage`: S3 buckets (Frontend and Documents) and RDS PostgreSQL database with pgvector.
  - `vpc`: VPC, public/private subnets, NAT gateways, and VPC endpoints.

- **Environments (`infra/terraform/aws/environments/dev`)**:
  - Instantiates the above modules for the `dev` environment.
  - Uses an S3 remote backend for state storage, with locking maintained directly within S3.
  - Parameters are passed via variables, ensuring no hard-coded ARNs or region references exist in the modules.

- **Kubernetes Resources (`infra/terraform/k8s`)**:
  - Configures the Kubernetes provider using EKS cluster credentials.
  - Deploys necessary CRDs, ALB GatewayClass, and API Gateway configurations via `kubectl_manifest` and `helm_release` utilizing templates from `infra/terraform/k8s/manifests/`.
  - Integrates the AWS Secrets Store CSI driver to mount configurations from SSM Parameter Store and Secrets Manager via a dynamically templated `SecretProviderClass`.

## Security & IAM
- The EKS nodes reside in private subnets.
- Dedicated EKS Pod Identity Associations enforce the principle of least privilege, allowing API and Worker pods specific access to Bedrock, S3, RDS Proxy, and SQS as needed.
- Pod Identities are additionally granted `secretsmanager:DescribeSecret` and `ssm:GetParameter` permissions, allowing the `secrets-store-csi-driver` to fetch sensitive parameters securely on behalf of the application pods.

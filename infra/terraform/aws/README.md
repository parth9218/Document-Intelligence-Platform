# AWS Cloud Infrastructure (Terraform)

<p align="center">
  <strong>Production-grade modular Terraform configurations provisioning enterprise AWS cloud infrastructure for the AI Document Intelligence Platform.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Terraform-%3E%3D_1.15.0-844FBA?style=flat-square&logo=terraform&logoColor=white" alt="Terraform >= 1.15" />
  <img src="https://img.shields.io/badge/AWS_Provider-6.67.0-FF9900?style=flat-square&logo=amazonwebservices&logoColor=white" alt="AWS Provider 6.67" />
  <img src="https://img.shields.io/badge/EKS_Auto_Mode-v1.37-FF9900?style=flat-square&logo=amazoneks&logoColor=white" alt="EKS Auto Mode 1.37" />
  <img src="https://img.shields.io/badge/RDS_PostgreSQL-pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL pgvector" />
  <img src="https://img.shields.io/badge/Amazon_CloudFront-Edge_Routing-D05C4C?style=flat-square&logo=amazonwebservices&logoColor=white" alt="CloudFront" />
  <img src="https://img.shields.io/badge/Amazon_SQS-DLQ_Redrive-FF4F8B?style=flat-square&logo=amazonsqs&logoColor=white" alt="Amazon SQS" />
</p>

<p align="center">
  <a href="#overview">Overview</a> &bull;
  <a href="#architecture-topology">Architecture</a> &bull;
  <a href="#modular-architecture">Modules</a> &bull;
  <a href="#multi-environment-strategy">Environments</a> &bull;
  <a href="#deployment-workflow">CLI Usage</a> &bull;
  <a href="#configuration-variables--outputs">Variables & Outputs</a> &bull;
  <a href="#apple-silicon--arm64-compatibility">ARM64 Note</a> &bull;
  <a href="https://parth9218.github.io/Document-Intelligence-Platform/">📖 Full Documentation</a>
</p>

---

## Overview

The `infra/terraform/aws` directory houses declarative Terraform configurations provisioning the cloud-native AWS foundation for the AI Document Intelligence Platform. This infrastructure layer establishes secure, decoupled, zero-static-credential cloud primitives for containerized workloads running on Amazon EKS.

### Key Architectural Highlights

- **Amazon EKS in Auto Mode (Kubernetes 1.37)**: Modern compute architecture operating strictly in **EKS Auto Mode** with automated `general-purpose` and `system` node pools (`compute_config = { enabled = true, node_pools = ["general-purpose", "system"] }`). Traditional EC2 Managed Node Groups, launch templates, and separate cluster autoscaling agents are eliminated in favor of AWS-managed Karpenter infrastructure. Workload authorization bypasses legacy IRSA in favor of native **EKS Pod Identity Associations**.
- **RDS PostgreSQL with pgvector & IAM DB Auth**: Relational database instance pre-configured with the `pgvector` extension for 1024-dimensional cosine similarity indexing. Static database passwords in Kubernetes are eliminated; pods connect dynamically using short-lived IAM connection tokens via `@aws-sdk/rds-signer`.
- **Direct S3 Multipart Ingestion & SQS Queue Decoupling**: Browser clients upload large PDF files directly to Amazon S3 using AWS SDK v3 Presigned POST policies. Bucket events trigger asynchronous SQS messages to decouple client ingestion from background worker processing, protected by a Dead-Letter Queue (DLQ) with a 3-retry redrive policy.
- **Unified CloudFront Edge Routing**: Single Amazon CloudFront CDN distribution serving both statically compiled React frontend assets from S3 (default behavior) and reverse-proxying `/api/*` traffic to the Kubernetes Application Load Balancer (ALB). This resolves browser HTTPS/HTTP mixed-content rejections without requiring custom domain ACM certificates on the ALB.
- **Hierarchical ECR Namespaces**: Slash-delimited private ECR repositories (`${project}/${env}/${app}`) enabling seamless coexistence of Docker container images and Helm OCI charts without mutating upstream chart metadata.

---

## Architecture Topology

The infrastructure provisioned exclusively by this Terraform layer spans edge routing, networking, compute control plane, asynchronous messaging, persistent vector storage, and machine learning foundation models:

<p align="center">
  <img src="../../../docs-site/docs/assets/aws-infrastructure.png" alt="AWS Cloud Infrastructure Topology" width="100%" />
</p>

### Infrastructure Data & Resource Flows

1. **Client Edge Ingress**: Browser clients access the globally distributed **Amazon CloudFront** CDN distribution. Requests for static Single Page Application assets (`/*`) resolve directly against the private S3 Frontend Bucket. API requests (`/api/*`) are reverse-proxied across the Internet Gateway to the **AWS Application Load Balancer (ALB)** in the public subnets.
2. **Direct Storage Ingestion**: Document uploads completely bypass the API gateway compute layer. The browser receives an AWS SDK v3 Presigned POST policy and transmits files directly to the private **Amazon S3 Documents Bucket**.
3. **Decoupled Asynchronous Messaging**: S3 bucket `s3:ObjectCreated:*` notifications deliver JSON payloads directly into **Amazon SQS**. A Dead-Letter Queue (DLQ) isolates poison-pill payloads after 3 failed attempts, while workers maintain a 600-second visibility timeout for idempotent processing.
4. **VPC Network Isolation & Compute**: Amazon EKS Auto Mode compute nodes (`general-purpose` and `system` pools) and the Amazon RDS PostgreSQL instance run strictly inside private subnets across two Availability Zones (`us-east-1a` and `us-east-1b`), egressing to the internet strictly via dedicated multi-AZ NAT Gateways.
5. **Zero-Static Credentials & Access Delegation**: EKS workloads authenticate to AWS Bedrock, Amazon S3, Amazon SQS, and Amazon RDS using short-lived **EKS Pod Identity Associations**, eliminating static IAM access keys and database passwords.

---

## Modular Architecture

The root Terraform configuration delegates resource creation to focused, decoupled submodules located under `modules/`:

| Module          | Location             | Primary Responsibilities                                                                                                                                                                                                                              |
| :-------------- | :------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`core`**      | `modules/core/`      | Composition root module orchestrating all child modules. Configures inter-module dependencies, Availability Zone calculations, and automated PostgreSQL grant resources.                                                                              |
| **`vpc`**       | `modules/vpc/`       | Provisions 2-AZ network topology: public subnets, private subnets, Internet Gateway, multi-AZ NAT Gateways, route tables, and EKS/ALB subnet tags (`kubernetes.io/role/elb`, `kubernetes.io/role/internal-elb`).                                      |
| **`eks`**       | `modules/eks/`       | Deploys Amazon EKS (v1.37) in **Auto Mode** with automated `general-purpose` and `system` node pools (no Managed Node Groups). Configures **EKS Pod Identity Associations** for API, Worker, External Secrets, and ALB Controller service accounts. Sets up least-privilege IAM policies and admin access entries. |
| **`storage`**   | `modules/storage/`   | Provisions private S3 documents bucket (with SSE encryption, block public access, and SQS notifications), static frontend S3 bucket, CloudFront distribution (with dual origins), and RDS PostgreSQL instance with IAM authentication enabled.        |
| **`messaging`** | `modules/messaging/` | Provisions the ingestion Amazon SQS FIFO/Standard queue, Dead-Letter Queue (DLQ) with redrive policy (`maxReceiveCount = 3`, 600s visibility timeout), and SQS queue policies authorizing S3 bucket notifications.                                    |
| **`ecr`**       | `modules/ecr/`       | Configures slash-delimited private ECR repositories (`docintel/${env}/api` and `docintel/${env}/worker`) supporting both container images and Helm OCI charts, alongside automated lifecycle pruning policies.                                        |
| **`secrets`**   | `modules/secrets/`   | Configures AWS Secrets Manager secret definitions (for database credentials) and SSM Parameter Store entries (`/docintel/${env}/config`) consumed dynamically via the Secrets Store CSI driver.                                                       |
| **`acm`**       | `modules/acm/`       | Deploys AWS Certificate Manager (ACM) public TLS certificates and domain ownership validation records for custom API endpoints.                                                                                                                       |

---

## Multi-Environment Strategy

Infrastructure parameters and backend states are strictly isolated across environments (`dev`, `stg`, `prod`):

```text
infra/terraform/aws/
├── environments/
│   ├── dev/
│   │   ├── backend.config.hcl       # S3 remote state key: aws/terraform.tfstate (dev bucket)
│   │   └── dev.tfvars               # Dev environment-specific variable overrides
│   ├── stg/
│   │   ├── backend.config.hcl       # S3 remote state key: aws/terraform.tfstate (stg bucket)
│   │   └── stg.tfvars               # Staging variable overrides
│   └── prod/
│       ├── backend.config.hcl       # S3 remote state key: aws/terraform.tfstate (prod bucket)
│       └── prod.tfvars              # Production variable overrides
├── main.tf                          # Root module entry point
├── variables.tf                     # Input variable definitions
├── outputs.tf                       # Exported state outputs
└── backend.tf                       # Remote backend declaration (configured via -backend-config)
```

Remote state is secured inside an Amazon S3 bucket with server-side encryption and state locking via DynamoDB.

---

## Deployment Workflow

### Prerequisites

- [Terraform CLI](https://developer.hashicorp.com/terraform/downloads) (`>= 1.15.0`)
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured with administrative credentials
- Target AWS Account ID and pre-created Terraform remote state S3 bucket

### Step-by-Step CLI Execution

```bash
# 1. Navigate to the AWS Terraform workspace
cd infra/terraform/aws

# 2. Initialize Terraform with environment-specific remote backend coordinates
terraform init -backend-config=environments/dev/backend.config.hcl

# 3. Generate a speculative execution plan
terraform plan -var-file=environments/dev/dev.tfvars -out=tfplan

# 4. Apply the planned changes
terraform apply tfplan
```

### The CloudFront & Kubernetes ALB Circular Dependency

A classical cross-stack circular dependency exists between AWS infrastructure and the Kubernetes platform:

1. **CloudFront Distribution** requires the DNS hostname of the AWS Application Load Balancer (`api_alb_dns_name`) to establish the `/api/*` origin.
2. **Kubernetes Gateway API** (provisioned in `infra/terraform/k8s`) creates that ALB, which requires the underlying EKS cluster and VPC provisioned by this AWS module.

**Resolution Strategy**:

- On initial greenfield provisioning, `api_alb_dns_name` is populated with a placeholder or fallback DNS hostname.
- Once the Kubernetes layer (`infra/terraform/k8s`) is applied and the ALB DNS is dynamically assigned, the CI/CD pipeline ([`.github/workflows/aws-deploy.yml`](../../../.github/workflows/aws-deploy.yml)) queries the live ALB DNS using the zero-provider [`infra/terraform/query`](../query/) module and re-runs `terraform apply` to update the CloudFront distribution origin with zero manual intervention.

---

## Configuration Variables & Outputs

### Key Input Variables (`variables.tf`)

| Variable                 | Type           | Default                  | Description                                                      |
| :----------------------- | :------------- | :----------------------- | :--------------------------------------------------------------- |
| `project_name`           | `string`       | `"docintel"`             | Project prefix used for resource naming and tagging              |
| `environment`            | `string`       | `"dev"`                  | Target deployment tier (`dev`, `stg`, `prod`)                    |
| `vpc_cidr`               | `string`       | `"10.0.0.0/16"`          | Primary IPv4 CIDR block for the AWS VPC                          |
| `db_name`                | `string`       | `"docintel"`             | PostgreSQL database name on RDS                                  |
| `db_username`            | `string`       | `"postgres"`             | Master administrative username for RDS                           |
| `api_hostname`           | `string`       | `"api.dev.docintel.com"` | Custom domain name for API routing and ACM certificate           |
| `github_actions_ci_role` | `string`       | _(Required)_             | ARN of the IAM role assumed by GitHub Actions workflows via OIDC |
| `admin_user_arns`        | `list(string)` | `[]`                     | List of IAM user ARNs granted system:masters access to EKS       |
| `api_alb_dns_name`       | `string`       | `"k8s-default-..."`      | Hostname of the ALB provisioned by the K8s Gateway layer         |

### Key Outputs (`outputs.tf`)

| Output Name                  | Description                                                            |
| :--------------------------- | :--------------------------------------------------------------------- |
| `vpc_id`                     | Identifier of the provisioned VPC                                      |
| `eks_cluster_name`           | Name of the Amazon EKS cluster (used by `infra/terraform/k8s`)         |
| `cluster_endpoint`           | Kubernetes API server HTTPS endpoint                                   |
| `db_endpoint`                | PostgreSQL RDS endpoint address (`host:port`)                          |
| `db_password_secret`         | ARN of the Secrets Manager secret storing database credentials         |
| `ssm_parameters_name`        | Name of the SSM Parameter Store entry containing environment configs   |
| `ssm_secrets_name`           | Name of the SSM Parameter Store secret entry                           |
| `ecr_registry_url`           | Base URL of the private ECR container and Helm OCI registry            |
| `ecr_repo_urls`              | Map of specific ECR repository URLs (`api`, `worker`)                  |
| `cloudfront_domain`          | Public domain name of the CloudFront distribution (`*.cloudfront.net`) |
| `cloudfront_distribution_id` | Distribution ID (used for automated CI/CD edge cache invalidations)    |
| `frontend_bucket_id`         | S3 bucket name hosting compiled React static assets                    |

---

## Apple Silicon & ARM64 Compatibility

> [!WARNING]
> **Provider Lock File Checksum Invariant**:
> If developing from an Apple Silicon (ARM64) workstation, Terraform local runs record Darwin ARM64 provider hashes in `.terraform.lock.hcl`. Standard Linux AMD64 CI/CD runners (such as GitHub-hosted Ubuntu runners) will fail if Linux AMD64 hashes are absent.
>
> Always update and commit platform-agnostic provider checksums:
>
> ```bash
> terraform providers lock -platform=linux_amd64 -platform=darwin_arm64
> ```

---

## Related Documentation

- [AWS Infrastructure Architecture Specification](https://parth9218.github.io/Document-Intelligence-Platform/infrastructure/aws/overview/)
- [Kubernetes Platform Infrastructure README](../k8s/README.md)
- [Remote State Query Module README](../query/README.md)
- [Multi-Environment Infrastructure CI/CD Pipeline](https://parth9218.github.io/Document-Intelligence-Platform/deployment/cd-dev/)

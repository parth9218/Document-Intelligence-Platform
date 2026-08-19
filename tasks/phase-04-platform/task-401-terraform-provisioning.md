# Task 401: Comprehensive Terraform Infrastructure Provisioning

## 1. Goal

Design, structure, and write the complete AWS infrastructure code for the AI Document Intelligence Platform using Terraform. You must follow industry best practices for modularity, maintainability, and security.

## 2. Infrastructure Architecture Requirements

You must provision the following components:

- **VPC & Networking**: Multi-AZ VPC with Public and Private subnets. EKS nodes must reside in private subnets. Include VPC Endpoints for S3, SQS, Secrets Manager, and Bedrock.
- **EKS Cluster**: An EKS cluster with two distinct managed node groups:
  - `api-nodes`: General purpose compute (at least `t3.medium`).
  - `worker-nodes`: Compute optimized or larger instances (at least `t3.large`) with taints applied (e.g., `workload=worker:NoSchedule`).
- **S3 & CDN**:
  - A Frontend bucket fronted by an Amazon CloudFront Distribution using Origin Access Control (OAC).
  - A Documents bucket configured with S3 Event Notifications targeting an SQS queue.
- **Database (RDS)**: Amazon RDS PostgreSQL with the `pgvector` extension. Must use IAM Database Authentication and include an RDS Proxy for connection pooling.
- **Messaging (SQS)**: A Standard SQS Queue for processing document events, paired with a Dead Letter Queue (DLQ).
- **Security & IAM (IRSA)**:
  - IAM Roles for Service Accounts (IRSA) for both API and Worker pods.
  - **API Role**: Permissions to connect to RDS Proxy, generate S3 pre-signed URLs, and invoke Bedrock LLMs.
  - **Worker Role**: Permissions to consume/delete from SQS, read from the S3 Documents bucket, invoke Bedrock Embeddings, and connect to RDS Proxy.
  - AWS Secrets Manager to store application secrets safely (consumed later by External Secrets Operator).

## 3. Terraform Directory Structure

You must build the `infra/terraform` directory from scratch using this modular layout:

```text
infra/terraform/
├── environments/
│   ├── dev/
│   │   ├── main.tf           # Instantiates modules for the dev environment
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── backend.tf        # S3 backend config (remote state)
│   │   └── dev.tfvars        # Environment-specific variable values
│   └── prod/                 # (Future environment, identical structure)
├── modules/
│   ├── vpc/                  # VPC, subnets, NAT, endpoints
│   ├── eks/                  # EKS cluster, node groups, taints, OIDC
│   ├── storage/              # S3 buckets, RDS pgvector, RDS proxy
│   ├── messaging/            # SQS, DLQ, S3 event notifications
│   └── iam/                  # IRSA roles, Bedrock policies, Secrets Manager
└── global/                   # ECR registries, Terraform remote state buckets/locks
```

## 4. Implementation Guidelines for the Agent

### Modularity & Reusability

- **Module Responsibility**: Each module in `modules/` must be completely agnostic to the environment. It must define its own `variables.tf` (inputs) and `outputs.tf` (exports).
- **Environment Instantiation**: The root configurations in `environments/<env>/` will call these modules and pass in values from `.tfvars`.

### Parameterization (No Hard-coding)

- **Never hard-code** regions, account IDs, environment names (dev, staging, prod), or resource naming prefixes.
- Use variables like `var.environment`, `var.project_name`, and `var.region`.
- Resource names should dynamically generate (e.g., `${var.project_name}-${var.environment}-vpc`).

### Remote State & State Isolation

- Configure a remote backend (`backend.tf`) using Amazon S3 for state storage and DynamoDB for state locking.
- Each environment (`dev`, `prod`) must use a completely separate state file path in the S3 bucket (e.g., `key = "dev/terraform.tfstate"`).

## 5. Acceptance Criteria

1. The directory structure perfectly matches the specification above.
2. No hard-coded ARNs, environment names, or AWS regions exist within the `modules/` directory.
3. Node groups are correctly sized (`t3.medium` minimum) and tainted appropriately.
4. IRSA roles enforce the principle of least privilege as defined above.
5. `terraform init`, `terraform fmt -check`, and `terraform validate` must succeed in the `environments/dev/` directory without errors.

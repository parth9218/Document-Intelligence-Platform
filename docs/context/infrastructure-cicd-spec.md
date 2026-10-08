# Multi-Environment Infrastructure CI/CD Specification

This document details the multi-environment, multi-concern CI/CD pipeline architecture for the AI Document Intelligence Platform, covering AWS and Kubernetes infrastructure across `dev`, `stg`, and `prod` environments.

---

## 1. Core Architectural Strategy

### 1.1 Separation of Environments and Concerns
To support independent release lifecycles and limit blast radius, the deployment model isolates:
* **Environments**: `dev` (development / trunk), `stg` (staging), `prod` (production).
* **Concerns**:
  * Infrastructure: `infra-aws`, `infra-k8s`
  * Microservices: `api`, `worker`, `frontend`
  * Helm Workloads: `helm-api`, `helm-worker`

### 1.2 Tag-Driven Releases with Immutable Audit Branches
* **Active Development**: All feature work and continuous integration merge into the trunk branch (`dev`). Commits directly trigger dev-scoped workflows.
* **Staging and Production Releases**: Triggered exclusively by cutting semantic release tags from validated commits on `dev`:
  * AWS Infrastructure: `{env}-infra-aws-v{major}.{minor}.{patch}` (e.g. `stg-infra-aws-v1.0.0`, `prod-infra-aws-v1.0.0`)
  * K8s Infrastructure: `{env}-infra-k8s-v{major}.{minor}.{patch}` (e.g. `stg-infra-k8s-v1.0.0`, `prod-infra-k8s-v1.0.0`)
  * Applications: `{env}-{api|worker|frontend}-v{major}.{minor}.{patch}`
  * Helm Charts: `{env}-helm-{api|worker}-v{major}.{minor}.{patch}`
* **Release Tracking Branches**:
  * Branches named `{env}/infra-aws`, `{env}/infra-k8s`, `{env}/{api|worker|frontend}` are **never manually modified or merged via pull requests**.
  * The CI/CD pipeline automatically executes a **selective checkout and commit** upon a verified, successful `apply`, capturing only the deployed files for that concern.
  * This preserves an immutable, chronological git history of what is running in each environment without pollutive merge noise.

---

## 2. Refactored Terraform Architecture

### 2.1 Directory Layout
The infrastructure layout adheres to a DRY root-module topology with isolated environment parameter files:

```text
infra/terraform/
├── aws/
│   ├── main.tf                    # Root AWS module instantiation (calls ./modules/core)
│   ├── variables.tf               # Top-level variables
│   ├── outputs.tf                 # Exported AWS outputs (VPC, EKS, RDS, S3, SSM, ACM)
│   ├── backend.tf                 # Generic S3 backend declaration
│   ├── modules/                   # Environment-agnostic modules (core, vpc, eks, storage, etc.)
│   └── environments/
│       ├── dev/
│       │   └── backend.config.hcl # dev S3 bucket, key, and region
│       ├── stg/
│       │   └── backend.config.hcl # stg S3 bucket, key, and region
│       └── prod/
│           └── backend.config.hcl # prod S3 bucket, key, and region
├── k8s/
│   ├── main.tf                    # Root K8s/Helm provider configurations
│   ├── helm.tf                    # Helm releases (ALB Controller, ArgoCD, KEDA)
│   ├── k8s.tf                     # Gateway API CRDs, ALB GatewayClass, Secrets Store CSI
│   ├── variables.tf
│   ├── outputs.tf                 # Exported K8s outputs (api_alb_dns)
│   ├── backend.tf                 # Generic S3 backend declaration
│   ├── manifests/                 # Kubernetes manifest templates
│   └── environments/
│       ├── dev/
│       │   └── backend.config.hcl # dev S3 backend config for K8s state
│       ├── stg/
│       │   └── backend.config.hcl # stg S3 backend config for K8s state
│       └── prod/
│           └── backend.config.hcl # prod S3 backend config for K8s state
└── query/
    ├── main.tf                    # data.terraform_remote_state reader (zero external providers)
    └── variables.tf               # bucket, key, region variables
```

### 2.2 Dual-Compatible Backend Configuration (`backend.config.hcl`)
Each environment defines its S3 state parameters in HCL syntax:
```hcl
bucket = "tf-state-doc-intel-dev-793140949744-us-east-1-an"
key    = "aws/terraform.tfstate"
region = "us-east-1"
```
Because HCL key-value format is dual-compatible:
1. It is passed as `-backend-config=environments/{env}/backend.config.hcl` during `terraform init`.
2. It is passed as `-var-file="../aws/environments/{env}/backend.config.hcl"` to `infra/terraform/query/` to read state directly.

### 2.3 Lightweight State Query Engine (`infra/terraform/query`)
* Declares only `data "terraform_remote_state" "infra"` backed by `s3`.
* Requires **zero external third-party providers** (`provider["terraform.io/builtin/terraform"]`).
* `terraform init` executes in < 1s with 0 MB download overhead.
* Produces an ephemeral local `.tfstate` on the GitHub Actions runner which is safely discarded at job completion.
* **Security Guardrail**: `.gitignore` must enforce `*.tfstate*` and `.terraform/` to prevent accidental workstation commits.

---

## 3. AWS Infrastructure Pipeline Flow (`aws-deploy.yml`)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Release Engineer
    participant GH as GitHub Actions (aws-deploy.yml)
    participant Query as infra/terraform/query
    participant AWS as infra/terraform/aws
    participant S3 as AWS S3 Remote State
    participant Git as Release Branch ({env}/infra-aws)

    Dev->>GH: Push Tag `{env}-infra-aws-v*` or Dev Dispatch
    GH->>GH: Parse tag: ENV, CONCERN, VERSION (or default to dev on push/dispatch)
    GH->>Query: Query K8s state for existing api_alb_dns
    Query->>S3: Read K8s state
    S3-->>Query: Return ALB DNS (or fallback to placeholder)
    Query-->>GH: ALB DNS resolved
    
    GH->>AWS: terraform init -backend-config=...
    GH->>AWS: terraform plan (governed via TF_VAR_* env vars) -out=tfplan
    
    rect rgb(255, 245, 230)
        Note over GH, Dev: Manual Approval Gate (GitHub Environment: stg/prod)
        GH-->>Dev: Prompt for Approval (Reviewers assigned)
        Dev->>GH: Approve Plan
    end
    
    GH->>AWS: terraform apply tfplan
    AWS->>S3: Commit new AWS State
    
    rect rgb(230, 255, 230)
        Note over GH, Git: Immutable Release History
        GH->>Git: Selective checkout & commit aws/ + modules/
        GH->>Git: git push origin {env}/infra-aws [skip ci]
    end
```

### Key Operational Rules:
1. **Target Environment Resolution (`detect-env`)**:
   - Resolves target environment (`stg`, `prod` strictly via git release tags; `dev` via dev push or manual `workflow_dispatch`).
   - Emits `outputs.env` so that downstream jobs (`plan-aws`, `apply-aws`) bind to `environment: ${{ needs.detect-env.outputs.env }}` before executing.
   - This ensures that repository environment variables (`vars.*`) and secrets (`secrets.*`) are scoped to the exact target environment during both plan and apply stages.
2. **CloudFront ↔ Dynamic ALB Handshake**:
   - Queries `infra/terraform/query` against the K8s backend config for the target environment.
   - If K8s has already deployed the Gateway, its ALB DNS is passed to `TF_VAR_api_alb_dns_name`.
   - If K8s has not yet been deployed (e.g. greenfield environment), a placeholder DNS is supplied so CloudFront provisions without blocking.
3. **Execution Stages (`plan` -> Manual Approval Gate -> `apply`)**:
   - `plan`: Runs in the target GitHub Environment to read scoped variables, generates execution plan, and uploads artifact `tfplan`.
   - `apply`: Binds to the target GitHub Environment to enforce required reviewer approvals for `stg` and `prod` before applying `tfplan`.
4. **Selective Audit Commit**:
   - Updates the target `{env}/infra-aws` tracking branch with only `infra/terraform/aws/**` and `infra/terraform/modules/**` from the release tag.

---

## 4. K8s Infrastructure Pipeline Flow (`k8s-deploy.yml`)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / Release Engineer
    participant GH as GitHub Actions (k8s-deploy.yml)
    participant Query as infra/terraform/query
    participant K8s as infra/terraform/k8s
    participant Cluster as EKS Cluster / Gateway
    participant Git as Release Branch ({env}/infra-k8s)

    Dev->>GH: Push Tag `{env}-infra-k8s-v*` or Dev Dispatch
    GH->>GH: Parse tag: ENV, CONCERN, VERSION (or default to dev on push/dispatch)
    
    rect rgb(255, 230, 230)
        Note over GH, Query: Pre-Flight AWS Output Validation
        GH->>Query: Query AWS State (vpc_id, eks_cluster_name, acm_cert_arn, etc.)
        alt Outputs Missing
            Query-->>GH: Missing prerequisites
            GH-->>Dev: Fail fast: "Deploy {env}-infra-aws-v* first!"
        end
    end
    
    GH->>K8s: terraform init -backend-config=...
    GH->>K8s: terraform plan (governed via TF_VAR_* env vars) -out=tfplan
    
    rect rgb(255, 245, 230)
        Note over GH, Dev: Manual Approval Gate (GitHub Environment: stg/prod)
        GH-->>Dev: Prompt for Approval
        Dev->>GH: Approve Plan
    end
    
    GH->>K8s: terraform apply tfplan
    GH->>Cluster: Poll Gateway resource until ALB DNS is allocated
    
    rect rgb(240, 240, 255)
        Note over GH, Cluster: ALB Drift Check against CloudFront
        GH->>Query: Compare new ALB DNS with CloudFront Origin in AWS state
        alt ALB DNS Changed
            GH-->>Dev: ⚠️ Warning: Trigger {env}-infra-aws-v* to update CloudFront!
        end
    end
    
    rect rgb(230, 255, 230)
        Note over GH, Git: Immutable Release History
        GH->>Git: Selective checkout & commit k8s/
        GH->>Git: git push origin {env}/infra-k8s [skip ci]
    end
```

### Key Operational Rules:
1. **Target Environment Resolution (`detect-env`)**:
   - Resolves target environment (`stg`, `prod` strictly via git release tags; `dev` via dev push or manual `workflow_dispatch`) and binds `plan-k8s` and `apply-k8s` jobs to `environment: ${{ needs.detect-env.outputs.env }}` so that scoped repository environment variables (`vars.*`) are accessible.
2. **Pre-flight AWS Output Validation**:
   - Uses `infra/terraform/query` with `backend.config.hcl` from AWS to assert that `vpc_id`, `eks_cluster_name`, `acm_cert_arn`, `ssm_parameters_name`, and `ssm_secrets_name` exist in the remote state.
   - If any are missing, the workflow aborts with an actionable error.
3. **Blast-Radius Isolation (No Direct AWS Applies)**:
   - K8s workflow **never** performs targeted `terraform apply` on AWS storage or CloudFront modules.
   - If the dynamically generated ALB DNS changed from what CloudFront is currently targeting, K8s alerts the user to cut an AWS release tag to update the origin.
4. **Selective Audit Commit**:
   - Updates `{env}/infra-k8s` with `infra/terraform/k8s/**` snapshots.

---

## 5. Branch & Tag Trigger Summary Matrix

| Pipeline | Trigger Pattern | Concurrency Group | Environment Gate | Selective Tracking Branch |
| :--- | :--- | :--- | :--- | :--- |
| **AWS Infra (dev)** | Push to `dev` under `infra/terraform/aws/**` or `workflow_dispatch` | `deploy-aws-dev` | None (Automatic) | N/A (Trunk tracked) |
| **AWS Infra (stg)** | Push tag: `stg-infra-aws-v*` | `deploy-aws-stg` | `stg` (Reviewer required) | `stg/infra-aws` |
| **AWS Infra (prod)** | Push tag: `prod-infra-aws-v*` | `deploy-aws-prod` | `prod` (Reviewer required) | `prod/infra-aws` |
| **K8s Infra (dev)** | Push to `dev` under `infra/terraform/k8s/**` or `workflow_dispatch` | `deploy-k8s-dev` | None (Automatic) | N/A (Trunk tracked) |
| **K8s Infra (stg)** | Push tag: `stg-infra-k8s-v*` | `deploy-k8s-stg` | `stg` (Reviewer required) | `stg/infra-k8s` |
| **K8s Infra (prod)** | Push tag: `prod-infra-k8s-v*` | `deploy-k8s-prod` | `prod` (Reviewer required) | `prod/infra-k8s` |

---

## 6. Infrastructure Teardown Workflow (`infra-destroy.yml`)

The infrastructure teardown pipeline tears down cloud resources in reverse dependency order (`destroy-k8s` followed by optional `destroy-aws`).

### 6.1 Invocation & Parameters:
- **`environment`**: `dev`, `stg`, or `prod`.
- **`destroy_aws`**: Boolean toggle indicating whether to destroy root AWS infrastructure after Kubernetes teardown finishes.
- **`aws_release_tag`**: Release tag (format `{env}-infra-aws-v{major}.{minor}.{patch}`) indicating the exact commit to checkout for AWS teardown in `stg` and `prod`.
- **`k8s_release_tag`**: Release tag (format `{env}-infra-k8s-v{major}.{minor}.{patch}`) indicating the exact commit to checkout for K8s teardown in `stg` and `prod`.

### 6.2 Checkout Semantics:
- **`dev` Environment**: Directly checks out the trunk branch (`dev`).
- **`stg` / `prod` Environments**: Validates release tag formatting and checks out the exact git tag references before executing `terraform destroy`.

### 6.3 State Query & Variables:
- Reads prerequisite AWS cluster parameters via `infra/terraform/query` against the environment's `backend.config.hcl`.
- Injects all variables strictly through `TF_VAR_*` environment variables bound to the resolved GitHub Environment scope.

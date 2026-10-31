---
title: "Initial AWS & GitHub Bootstrapping"
description: "One-time bootstrapping runbook to configure AWS remote state buckets, artifact storage, OIDC IAM federation, and GitHub Actions repository variables and secrets."
---

# Initial AWS & GitHub Bootstrapping

> Authoritative pre-flight operational runbook establishing cloud remote state backends, artifact storage, IAM OpenID Connect (OIDC) federation, and GitHub repository configuration before running CI/CD pipelines.

---

## Overview

Before executing automated infrastructure or application deployment workflows (`aws-deploy.yml`, `k8s-deploy.yml`, `frontend-deploy.yml`), the AWS account and GitHub repository must be initialized with foundational cloud backends, security roles, and repository secrets.

---

## 1. AWS Remote State S3 Buckets

Terraform utilizes Amazon S3 backends for state locking and team coordination across environments:

### Naming Convention
State buckets follow the pattern defined in `infra/terraform/*/environments/{env}/backend.config.hcl`:
```text
tf-state-doc-intel-{env}-{account_id}-{region}-an
```

### Bucket Provisioning & Security Invariants
Create three dedicated buckets for `dev`, `stg`, and `prod`:

1. **Bucket Versioning**:
    - Must be enabled to protect against catastrophic state corruption and allow rolling back to previous state revisions.
2. **Server-Side Encryption**:
    - Enforce default server-side encryption using AWS Key Management Service (SSE-KMS) or Amazon S3 managed keys (SSE-S3).
3. **Public Access Block**:
    - Enable all four S3 Public Access Block settings (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`) to prevent state leaks.
4. **State Locking**:
    - Modern Terraform (v1.16+) utilizes native S3 conditional write locking, eliminating the requirement for external DynamoDB lock tables when using standard S3 backend configurations.

---

## 2. Central Frontend Artifact Bucket

The frontend continuous delivery pipeline (`frontend-deploy.yml`) builds static assets once in the `dev` environment and uploads an immutable, versioned archive (`frontend-build-${SHORT_SHA}.tar.gz`) to a central storage bucket.

- **Bucket Purpose**: Staging immutable static artifacts for multi-environment promotion.
- **Naming Pattern**: `docintel-artifacts-{account_id}-{region}`
- **Security Invariants**:
    - S3 Versioning enabled.
    - Default SSE-S3 encryption.
    - Public access strictly blocked (CloudFront origin access identity/OAC will distribute user-facing assets from environment-specific buckets).

---

## 3. GitHub Actions AWS OIDC Federation

To eliminate the security liability of long-lived static AWS access keys stored in GitHub, workflows authenticate via **IAM OpenID Connect (OIDC)**:

### 1. Register GitHub OIDC Provider in AWS IAM
Create an Identity Provider in the AWS IAM Console or via CLI:
- **Provider Type**: OpenID Connect
- **Provider URL**: `https://token.actions.githubusercontent.com`
- **Audience**: `sts.amazonaws.com`

### 2. Create the GitHub Actions CI Role
Create an IAM Role (e.g. `GitHubActionsWorkflowRole`) with a scoped trust policy:

- **Federated Principal**: `arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`
- **Trust Condition**:
    - The `token.actions.githubusercontent.com:sub` claim must be restricted strictly to your repository:
        `repo:<ORGANIZATION_OR_USERNAME>/<REPOSITORY_NAME>:*`
- **Attached Policies**:
    - Policies granting least-privilege administrative permissions across VPC, EKS, RDS, S3, SQS, CloudFront, ECR, Secrets Manager, and IAM.

---

## 4. GitHub Configuration: Repository vs Environment Scope

GitHub Actions enforces a two-tier configuration hierarchy. When a workflow job binds to a deployment environment via `environment: ${{ needs.detect-env.outputs.env }}`, GitHub resolves variables and secrets with clear precedence:

1. **Environment-Level Values**: Take precedence and override any repository-level key with the same name.
2. **Repository-Level Values**: Serve as the global default fallback when an environment-level value is not explicitly defined.

---

### 4.1 Generic Repository-Level Variables (`vars.*`)

Configured under **Settings -> Secrets and variables -> Actions -> Variables**. These settings are universal across the entire platform:

| Variable Name | Required | Example / Recommended Value | Description |
| :--- | :--- | :--- | :--- |
| `AWS_REGION` | **Yes** | `us-east-1` | Primary AWS region for all deployment operations |
| `ARTIFACT_BUCKET_NAME` | **Yes** | `docintel-artifacts-123456789012-us-east-1` | Central S3 bucket storing immutable frontend build tarballs |
| `TF_PROJECT_NAME` | Optional | `docintel` | Resource naming prefix (defaults to `docintel` if unset) |
| `TF_GITHUB_REPOSITORY_URL` | **Yes** | `https://github.com/<OWNER>/<REPO>.git` | Full repository URL required by ArgoCD to fetch Helm values |
| `TF_VAR_GITHUB_ACTIONS_CI_ROLE` | **Yes** (or per env) | `arn:aws:iam::123456789012:role/GitHubActionsWorkflowRole` | Default IAM OIDC role assumed by GitHub Actions |

---

### 4.2 Generic Repository-Level Secrets (`secrets.*`)

Configured under **Settings -> Secrets and variables -> Actions -> Secrets**. These act as global fallbacks:

| Secret Name | Required | Recommended Usage | Description |
| :--- | :--- | :--- | :--- |
| `TF_DB_USERNAME` | Optional fallback | `postgres` | Default database administrator username (recommended to define per environment instead) |

---

### 4.3 Environment-Specific Variables (`vars.*`)

Configured under **Settings -> Environments -> {env} -> Environment variables**. These settings isolate networking, DNS, and IAM boundaries per tier:

| Variable Name | `dev` Value | `stg` Value | `prod` Value | Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `TF_VPC_CIDR` | `10.0.0.0/16` | `10.1.0.0/16` | `10.2.0.0/16` | Non-overlapping CIDR blocks prevent routing conflicts and enable cross-VPC interconnects |
| `TF_API_HOSTNAME` | `api.dev.docintel.example.com` | `api.stg.docintel.example.com` | `api.docintel.example.com` | Dedicated DNS hostnames bound to CloudFront / Gateway API |
| `TF_DB_NAME` | `docintel` | `docintel` | `docintel` | Relational database catalog name per environment |
| `TF_ADMIN_USER_ARNS` | `["arn:aws:iam::...:user/dev1"]` | `["arn:aws:iam::...:user/lead"]` | `["arn:aws:iam::...:user/architect"]` | Controls `kubectl` cluster admin permissions; broader in dev, strictly locked down in prod |
| `TF_VAR_GITHUB_ACTIONS_CI_ROLE` | *Dev Account Role ARN* | *Stg Account Role ARN* | *Prod Account Role ARN* | Overrides generic role when multi-account AWS Organizations are employed |
| `TF_TARGET_REVISION_APP` | `dev` | `stg` | `prod` | Overrides the target GitOps tracking branch for application deployments |
| `TF_TARGET_REVISION_HELM` | `dev` | `stg` | `prod` | Overrides the target GitOps tracking branch for Helm chart deployments |

---

### 4.4 Environment-Specific Secrets (`secrets.*`)

Configured under **Settings -> Environments -> {env} -> Environment secrets**. Enforces credential isolation and least privilege:

| Secret Name | Scope | Recommended Convention | Description |
| :--- | :--- | :--- | :--- |
| `TF_DB_USERNAME` | Environment (`dev`, `stg`, `prod`) | `docintel_{env}_admin` | Dedicated database master username per environment, preventing shared-credential compromise |

---

## 5. GitHub Environment Gates (`dev`, `stg`, `prod`)

Configure the three deployment tiers under **Settings -> Environments**:

1. **`dev` Environment**:
    - **Deployment branch**: Restricted to the `dev` trunk branch and manual workflow dispatches.
    - **Reviewers**: None (enables unblocked continuous deployment on trunk merge).
2. **`stg` Environment**:
    - **Deployment branch**: Restricted to semantic release tags matching `stg-*`.
    - **Reviewers**: Optional QA / Platform Lead sign-off.
3. **`prod` Environment**:
    - **Deployment branch**: Restricted to semantic release tags matching `prod-*`.
    - **Required Reviewers**: Enforces designated Senior Cloud Architect / Security approval before infrastructure applies (`apply-aws`, `apply-k8s`) or workload promotions proceed.

---

## 6. Pre-Flight Verification Checklist

Before triggering the first continuous deployment workflow:

- [ ] S3 state buckets created and versioning confirmed (`tf-state-doc-intel-{env}-*`).
- [ ] Central artifact bucket created (`ARTIFACT_BUCKET_NAME`).
- [ ] OIDC identity provider active in AWS IAM with `sts.amazonaws.com` audience.
- [ ] IAM role trust policy matches the repository path.
- [ ] Generic Repository Variables and Secrets populated in repository settings.
- [ ] Environment Variables and Secrets populated across `dev`, `stg`, and `prod` environments.
- [ ] Required reviewer protection rules activated on `stg` and `prod` environments.

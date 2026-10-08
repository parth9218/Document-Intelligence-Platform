# Task 501: Infrastructure CI/CD Pipelines (AWS & K8s)

## 1. Goal

Implement the multi-environment, tag-driven CI/CD pipelines for **AWS Infrastructure** (`.github/workflows/aws-deploy.yml`) and **Kubernetes Infrastructure** (`.github/workflows/k8s-deploy.yml`), incorporating the refactored Terraform module structure (`infra/terraform/aws/`, `infra/terraform/k8s/`, `infra/terraform/query/`), manual approval gates via GitHub Environments, pre-flight state validation, and automated selective release branch tracking.

---

## 2. Prerequisites & Dependencies

* Specification Document: [infrastructure-cicd-spec.md](file:///Users/parth/RAG/Document%20Intelligence%20Platform/docs/context/infrastructure-cicd-spec.md)
* Architecture Decisions: Multi-Environment Tag-Driven Release Strategy
* Refactored Terraform Directories:
  * `infra/terraform/aws/` (root module with `main.tf`, `variables.tf`, `outputs.tf`, `backend.tf`)
  * `infra/terraform/aws/environments/{env}/` (`backend.config.hcl`, `{env}.tfvars`)
  * `infra/terraform/k8s/` (root module with `main.tf`, `helm.tf`, `k8s.tf`, `variables.tf`, `outputs.tf`, `backend.tf`)
  * `infra/terraform/k8s/environments/{env}/` (`backend.config.hcl`, `{env}.tfvars`)
  * `infra/terraform/query/` (zero-provider remote state query module)

---

## 3. Scope of Modifications

### 3.1 Git Hygiene (`.gitignore`)
* Add the following ignores to [.gitignore](file:///Users/parth/RAG/Document%20Intelligence%20Platform/.gitignore):
  ```gitignore
  # Terraform local state and tool caches
  *.tfstate
  *.tfstate.*
  .terraform/
  .terraform.lock.hcl
  ```

---

### 3.2 AWS Infrastructure Workflow (`.github/workflows/aws-deploy.yml`)

#### Trigger Configuration:
* **Push to Dev Branch**: Trigger when changes occur under `infra/terraform/aws/**` (targets `dev` environment).
* **Push Tags**: Trigger on tags matching patterns:
  * `stg-infra-aws-v*` (targets `stg` environment)
  * `prod-infra-aws-v*` (targets `prod` environment)
* **Manual `workflow_dispatch`**: Triggers `dev` environment only (no environment inputs).

#### Dynamic Environment Resolution:
Extract environment from release tag (`stg`/`prod`), dev push, or workflow dispatch (`dev`):
```bash
if [[ "${{ github.ref_type }}" == "tag" ]]; then
  TARGET_ENV=$(echo "${{ github.ref_name }}" | cut -d'-' -f1)
elif [[ ("${{ github.event_name }}" == "push" && "${{ github.ref_name }}" == "dev") || "${{ github.event_name }}" == "workflow_dispatch" ]]; then
  TARGET_ENV="dev"
fi
```

#### Step Updates:
1. **CloudFront ALB DNS Query**:
   * Navigate to `infra/terraform/query/`.
   * Run `terraform init`.
   * Run `terraform apply -auto-approve -input=false -var-file="../k8s/environments/${{ env.ENV }}/backend.config.hcl"`.
   * Extract `api_alb_dns` output using `jq`. If empty or null, fall back to `placeholder.elb.amazonaws.com`.
   * Export to `TF_VAR_api_alb_dns_name`.
2. **Working Directory & Backend Init**:
   * Change `working-directory` to `infra/terraform/aws`.
   * `terraform init -backend-config="environments/${{ env.ENV }}/backend.config.hcl"`.
3. **Plan Phase (`plan-aws` job)**:
   * Populate `TF_VAR_*` variables from GitHub Actions vars, secrets, environment context, and dynamic outputs.
   * Run `terraform plan -out=tfplan`.
   * Upload `tfplan` as workflow artifact.
4. **Approval Gate & Apply Phase (`apply-aws` job)**:
   * Binds to `environment: ${{ env.ENV }}`.
   * Downloads `tfplan` artifact.
   * Runs `terraform apply -auto-approve tfplan`.
   * Emits required infrastructure outputs (`vpc_id`, `eks_cluster_name`, `acm_cert_arn`, `ssm_parameters_name`, `ssm_secrets_name`).
5. **Selective Release Branch Tracking (for tags only)**:
   * If `${{ github.ref_type }} == 'tag'`:
   * Fetch and checkout branch `${{ env.ENV }}/infra-aws`.
   * Clean working directory except `.git`.
   * Run `git checkout tags/${{ github.ref_name }} -- infra/terraform/aws infra/terraform/query`.
   * Commit and push: `git commit -m "Release ${{ github.ref_name }} [skip ci]"`.

---

### 3.3 Kubernetes Infrastructure Workflow (`.github/workflows/k8s-deploy.yml`)

#### Trigger Configuration:
* **Push to Dev Branch**: Trigger when changes occur under `infra/terraform/k8s/**` (targets `dev` environment).
* **Push Tags**: Trigger on tags matching patterns:
  * `stg-infra-k8s-v*` (targets `stg` environment)
  * `prod-infra-k8s-v*` (targets `prod` environment)
* **Manual `workflow_dispatch`**: Triggers `dev` environment only (no environment inputs).

#### Step Updates:
1. **Pre-flight AWS Output Validation**:
   * Navigate to `infra/terraform/query/`.
   * Run `terraform init`.
   * Run `terraform apply -auto-approve -input=false -var-file="../aws/environments/${{ env.ENV }}/backend.config.hcl"`.
   * Validate that `vpc_id`, `eks_cluster_name`, `acm_cert_arn`, `ssm_parameters_name`, and `ssm_secrets_name` are non-empty.
   * If any are missing, fail immediately: `echo "::error::Prerequisite AWS outputs missing. Deploy ${{ env.ENV }}-infra-aws-v* first!" && exit 1`.
   * Export validated values to environment variables.
2. **Remove Outdated Steps**:
   * Remove `"Check if AWS was also modified"` path filtering check.
   * Remove targeted `terraform apply` on AWS CloudFront module.
3. **Working Directory & Backend Init**:
   * Change `working-directory` to `infra/terraform/k8s`.
   * `terraform init -backend-config="environments/${{ env.ENV }}/backend.config.hcl"`.
4. **Plan Phase (`plan-k8s` job)**:
   * Populate `TF_VAR_*` variables from GitHub Actions vars, environment context, and validated AWS outputs.
   * Run `terraform plan -out=tfplan`.
   * Upload `tfplan` as workflow artifact.
5. **Approval Gate & Apply Phase (`apply-k8s` job)**:
   * Binds to `environment: ${{ env.ENV }}`.
   * Downloads `tfplan` artifact.
   * Runs `terraform apply -auto-approve tfplan`.
6. **ALB Drift Check**:
   * Poll `kubectl get gateway` for allocated ALB DNS.
   * Query AWS CloudFront origin via `infra/terraform/query`.
   * If different: post actionable warning instructing operator to run `{env}-infra-aws-v*` release to re-bind CloudFront.
7. **Selective Release Branch Tracking (for tags only)**:
   * If `${{ github.ref_type }} == 'tag'`:
   * Fetch and checkout branch `${{ env.ENV }}/infra-k8s`.
   * Clean working directory except `.git`.
   * Run `git checkout tags/${{ github.ref_name }} -- infra/terraform/k8s infra/terraform/query`.
   * Commit and push: `git commit -m "Release ${{ github.ref_name }} [skip ci]"`.

---

## 4. Acceptance Criteria

- [x] `.gitignore` contains `*.tfstate*` and `.terraform/`.
- [x] `aws-deploy.yml` triggers on push to `dev` (aws paths) and tags `stg-infra-aws-v*` / `prod-infra-aws-v*`.
- [x] `k8s-deploy.yml` triggers on push to `dev` (k8s paths) and tags `stg-infra-k8s-v*` / `prod-infra-k8s-v*`.
- [x] Both workflows point `working-directory` to `infra/terraform/aws` and `infra/terraform/k8s` respectively.
- [x] Both workflows leverage `environments/{env}/backend.config.hcl` for backend initialization.
- [x] `infra/terraform/query` is utilized for cross-stack reading without downloading extra providers.
- [x] Manual approval gates are enforced for `stg` and `prod` via GitHub Environments.
- [x] Selective release branch commits run only on successful apply for tagged executions with `[skip ci]`.
- [x] Pre-flight checks in `k8s-deploy.yml` fail cleanly if AWS prerequisites are absent.
- [x] No cross-stack targeted applies violate the blast radius boundary.

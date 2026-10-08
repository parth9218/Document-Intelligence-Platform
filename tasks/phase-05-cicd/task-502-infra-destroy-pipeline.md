# Task 502: Infrastructure Teardown Pipeline (`infra-destroy.yml`)

## 1. Goal

Implement a production-grade, reverse-dependency infrastructure teardown pipeline in [`.github/workflows/infra-destroy.yml`](file:///Users/parth/RAG/Document%20Intelligence%20Platform/.github/workflows/infra-destroy.yml) to destroy multi-environment AWS and Kubernetes infrastructure. The workflow must:
- Safeguard operations via manual `workflow_dispatch` only.
- Support environment targeting (`dev`, `stg`, `prod`).
- Enforce branch checkout (`dev`) for development teardowns, while strictly requiring validated release tags (`{env}-infra-aws-v{major}.{minor}.{patch}` and `{env}-infra-k8s-v{major}.{minor}.{patch}`) for staging and production teardowns.
- Support selective teardown (Kubernetes layer only, or Kubernetes followed by root AWS infrastructure via the `destroy_aws` toggle).
- Enforce GitHub Environment approvals and secret scoping.
- Gracefully handle pre-existing or missing AWS state via `infra/terraform/query` to prevent unrecoverable cluster connection failures.

---

## 2. Prerequisites & Dependencies

* Specification Document: [infrastructure-cicd-spec.md](file:///Users/parth/RAG/Document%20Intelligence%20Platform/docs/context/infrastructure-cicd-spec.md) (Section 6: Infrastructure Teardown Workflow)
* Existing Terraform Modules:
  * `infra/terraform/aws/`
  * `infra/terraform/k8s/`
  * `infra/terraform/query/`
* Existing Task 501 CI/CD Pipelines (`aws-deploy.yml`, `k8s-deploy.yml`)

---

## 3. Scope of Modifications

### 3.1 Input Validation & Git Reference Resolution (`validate-and-resolve` job)
* **Inputs**:
  * `environment`: Choice (`dev`, `stg`, `prod`, default `dev`).
  * `destroy_aws`: Boolean flag to confirm destroying root AWS infrastructure (default `false`).
  * `aws_release_tag`: Tag format `{env}-infra-aws-v{major}.{minor}.{patch}` (required for `stg`/`prod` when `destroy_aws` is true).
  * `k8s_release_tag`: Tag format `{env}-infra-k8s-v{major}.{minor}.{patch}` (required for `stg`/`prod`).
* **Resolution Logic**:
  * For `dev`: Sets `aws_ref=dev` and `k8s_ref=dev`.
  * For `stg` and `prod`: Validates format of `k8s_release_tag` (and `aws_release_tag` if `destroy_aws == true`), setting target refs to the respective tags.
* **Outputs**: `env`, `destroy_aws`, `aws_ref`, `k8s_ref`.

### 3.2 Kubernetes Layer Teardown (`destroy-k8s` job)
* Binds to GitHub Environment `environment: ${{ needs.validate-and-resolve.outputs.env }}`.
* Checks out code at target ref (`needs.validate-and-resolve.outputs.k8s_ref`).
* Queries AWS state via `infra/terraform/query` with readonly lockfile and backend config:
  * If EKS cluster is missing or already destroyed, marks `has_cluster=false` and exits 0 cleanly without failing.
* If cluster exists (`has_cluster == true`):
  * Initializes `infra/terraform/k8s` using `-backend-config="environments/${{ env.ENV }}/backend.config.hcl"`.
  * Injects all required variables via `TF_VAR_*`.
  * Executes `terraform destroy -auto-approve`.

### 3.3 Root AWS Infrastructure Teardown (`destroy-aws` job)
* Depends on `[validate-and-resolve, destroy-k8s]`.
* Only runs if `needs.validate-and-resolve.outputs.destroy_aws == 'true'`.
* Binds to GitHub Environment `environment: ${{ needs.validate-and-resolve.outputs.env }}`.
* Checks out code at target ref (`needs.validate-and-resolve.outputs.aws_ref`).
* Initializes `infra/terraform/aws` using `-backend-config="environments/${{ env.ENV }}/backend.config.hcl"`.
* Injects required `TF_VAR_*` variables (including placeholder ALB DNS).
* Executes `terraform destroy -auto-approve`.

---

## 4. Acceptance Criteria

- [x] `workflow_dispatch` accepts `environment`, `destroy_aws`, `aws_release_tag`, and `k8s_release_tag`.
- [x] `dev` teardown checks out `dev` branch; `stg`/`prod` teardown requires validated release tags.
- [x] Reverse dependency order is preserved (`destroy-k8s` executes before `destroy-aws`).
- [x] `destroy-aws` only executes when explicitly enabled (`destroy_aws == true`).
- [x] `infra/terraform/query` detects missing EKS cluster outputs and skips K8s teardown cleanly.
- [x] Both destruction jobs bind to the GitHub Environment for approval gating and secret scoping.
- [x] `AWS_REGION` is explicitly provided in job `env` blocks across both destruction jobs.
- [x] Non-destructive local simulation tasks configured via `act` for `validate-and-resolve` phase (`destroy-validate-dev`, `destroy-validate-stg`, `destroy-validate-prod`).

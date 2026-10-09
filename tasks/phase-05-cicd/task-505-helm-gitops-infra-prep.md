# Task 505: Helm GitOps Infrastructure & Multi-Source OCI Setup

## 1. Goal

Implement the infrastructure prerequisites and manifest configurations required to support **Helm OCI Chart Releases via Amazon ECR** and **ArgoCD Multi-Source GitOps ApplicationSets**. This involves:
1. Refactoring ECR repository namespaces to hierarchical paths (`${project}/${env}/${app}`) enabling seamless Helm OCI push/pull without `Chart.yaml` name modification.
2. Configuring EKS IAM permissions and Pod Identity Associations for the ArgoCD `repo-server` to authenticate against private AWS ECR registries.
3. Enabling ArgoCD's native ECR credential helper in the Helm release configuration.
4. Restructuring the `infra/k8s/argocd/` directory layout to decouple application container tags from Helm chart versions.
5. Updating `argocd-applicationset.yaml` to employ a Matrix generator with ArgoCD Multiple Sources (`$ref`) referencing OCI Helm charts and Git values files.

> **Note**: This task focuses strictly on infrastructure, Terraform, and manifest configurations. The GitHub Actions release workflow for Helm charts (`helm-cicd.yml`) will be implemented in a subsequent task.

---

## 2. Prerequisites & Dependencies

* Architecture Decisions: [GitOps Multi-Source Release Architecture & Security Specification](file:///Users/parth/RAG/Document%20Intelligence%20Platform/docs/context/infrastructure-cicd-spec.md)
* Existing Terraform Modules:
  * `infra/terraform/aws/modules/ecr/`
  * `infra/terraform/aws/modules/eks/`
  * `infra/terraform/k8s/`
* Existing GitOps Directory: `infra/k8s/argocd/`
* Existing Workloads: `infra/k8s/helm/api/` and `infra/k8s/helm/worker/`

---

## 3. Scope of Modifications

### 3.1 ECR Repository Namespace Hierarchy (`infra/terraform/aws/modules/ecr/main.tf`)

#### Problem:
Currently, ECR repositories are named with flat dashes: `${var.project_name}-${var.environment}-api` and `${var.project_name}-${var.environment}-worker`. When Helm packages a chart where `name: api` in `Chart.yaml`, pushing to an OCI registry via `helm push <archive>.tgz oci://<account>.dkr.ecr.<region>.amazonaws.com/<namespace>` requires the repository's final path component to match the chart name (`api`).

#### Modifications:
1. Update `local.repositories` in `infra/terraform/aws/modules/ecr/main.tf` to use slash-separated namespaces:
   ```terraform
   locals {
     repositories = [
       "${var.project_name}/${var.environment}/api",
       "${var.project_name}/${var.environment}/worker"
     ]
   }
   ```
2. Maintain `image_tag_mutability = "IMMUTABLE"` to enforce strict artifact provenance across both Docker images and Helm charts.
3. Verify that repository policies and lifecycle policies automatically map to the new repository names.
4. Export updated repository URLs and registry domains in `infra/terraform/aws/modules/ecr/outputs.tf` and root `infra/terraform/aws/outputs.tf`.

---

### 3.2 EKS IAM & Pod Identity for ArgoCD Repo-Server (`infra/terraform/aws/modules/eks/iam.tf`)

#### Problem:
ArgoCD's `repo-server` component fetches Helm chart archives from external repositories during manifest rendering. When pulling from AWS ECR OCI registries, authentication tokens expire after 12 hours. ArgoCD requires an AWS IAM identity and permissions to dynamically negotiate ECR authorization tokens.

#### Modifications:
1. **IAM Policy for ArgoCD ECR Access**:
   Define `argocd_repo_server_ecr_policy` in `infra/terraform/aws/modules/eks/iam.tf`:
   ```terraform
   data "aws_iam_policy_document" "argocd_repo_server_ecr_policy" {
     statement {
       sid    = "ECRAuthToken"
       effect = "Allow"
       actions = [
         "ecr:GetAuthorizationToken"
       ]
       resources = ["*"]
     }
     statement {
       sid    = "ECRRepositoryPull"
       effect = "Allow"
       actions = [
         "ecr:BatchCheckLayerAvailability",
         "ecr:GetDownloadUrlForLayer",
         "ecr:BatchGetImage"
       ]
       resources = var.ecr_repo_arns
     }
   }

   resource "aws_iam_policy" "argocd_repo_server_ecr_policy" {
     name   = "${var.project_name}-${var.environment}-argocd-repo-server-ecr-policy"
     policy = data.aws_iam_policy_document.argocd_repo_server_ecr_policy.json
   }
   ```
2. **IAM Role for ArgoCD Repo-Server**:
   Create `argocd_repo_server_role` with an assume role policy for `pods.eks.amazonaws.com` (EKS Pod Identity).
3. **EKS Pod Identity Association**:
   Link the role to the ArgoCD repo-server service account:
   ```terraform
   resource "aws_eks_pod_identity_association" "argocd_repo_server" {
     cluster_name    = module.eks.cluster_name
     namespace       = "argocd"
     service_account = "argocd-repo-server"
     role_arn        = aws_iam_role.argocd_repo_server_role.arn
   }
   ```

---

### 3.3 ArgoCD Native ECR Credential Helper (`infra/terraform/k8s/helm.tf`)

#### Modifications:
In `resource "helm_release" "argocd"` under `infra/terraform/k8s/helm.tf`:
1. Add Helm configuration parameters to enable the native ECR credential helper inside the `repoServer`:
   ```terraform
   set = [
     {
       name  = "repoServer.env[0].name"
       value = "AWS_REGION"
     },
     {
       name  = "repoServer.env[0].value"
       value = data.aws_region.current.region
     },
     {
       name  = "configs.params.reposerver\\.ecr\\.credential\\.helper"
       value = "true"
     }
   ]
   ```
2. Ensure `repoServer.serviceAccount.name` matches `"argocd-repo-server"` so that the Pod Identity Association attaches correctly.

---

### 3.4 GitOps Directory Layout Restructuring (`infra/k8s/argocd/`)

#### Problem:
Currently, `infra/k8s/argocd/{env}/api/` and `worker/` combine both application version tracking and Helm chart path specifications in a single `config.json`. To support decoupled release lifecycles between container images and Helm templates, the tracking files must be separated into concern-specific directories.

#### Directory Layout:
Restructure `infra/k8s/argocd/${environment}/` across both concerns:

```text
infra/k8s/argocd/${environment}/
├── api/
│   ├── config.json         # Managed by api-cicd (Branch: {env}/app)
│   └── values.yaml         # Environment values & image tag
├── worker/
│   ├── config.json         # Managed by worker-cicd (Branch: {env}/app)
│   └── values.yaml         # Environment values & image tag
├── helm-api/
│   └── config.json         # Managed by helm-cicd (Branch: {env}/helm)
└── helm-worker/
    └── config.json         # Managed by helm-cicd (Branch: {env}/helm)
```

#### File Schemas:
1. **Application Config (`infra/k8s/argocd/${environment}/${app}/config.json`)**:
   ```json
   {
     "app": "api",
     "target_commit": "2bfe65f2c2da41e1dbe7afb587f65b4921cf8768"
   }
   ```
2. **Helm OCI Config (`infra/k8s/argocd/${environment}/helm-${app}/config.json`)**:
   ```json
   {
     "app": "api",
     "chart_name": "api",
     "chart_version": "0.1.0"
   }
   ```
3. **Application Environment Values (`infra/k8s/argocd/${environment}/${app}/values.yaml`)**:
   Extracted from the current `infra/k8s/helm/${app}/values.${environment}.yaml` so that image tag updates are isolated from chart template files.

---

### 3.5 ArgoCD ApplicationSet Multiple Sources with OCI (`infra/terraform/k8s/manifests/argocd-applicationset.yaml`)

#### Modifications:
Rewrite `argocd-applicationset.yaml` to utilize a Matrix generator and Multiple Sources with `$ref`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: "${project_name}-${environment}-argocd-applicationset"
  namespace: argocd
spec:
  generators:
    # Generator for API Microservice
    - matrix:
        generators:
          - git:
              repoURL: '${github_repository_url}'
              revision: '${targetRevision_app}'
              files:
                - path: "infra/k8s/argocd/${environment}/api/config.json"
          - git:
              repoURL: '${github_repository_url}'
              revision: '${targetRevision_helm}'
              files:
                - path: "infra/k8s/argocd/${environment}/helm-api/config.json"

    # Generator for Worker Microservice
    - matrix:
        generators:
          - git:
              repoURL: '${github_repository_url}'
              revision: '${targetRevision_app}'
              files:
                - path: "infra/k8s/argocd/${environment}/worker/config.json"
          - git:
              repoURL: '${github_repository_url}'
              revision: '${targetRevision_helm}'
              files:
                - path: "infra/k8s/argocd/${environment}/helm-worker/config.json"

  template:
    metadata:
      name: '${project_name}-${environment}-{{app}}'
      annotations:
        argocd.argoproj.io/sync-wave: "10"
    spec:
      project: default
      sources:
        # Source 1: Helm Chart from AWS ECR OCI Registry
        - repoURL: '${ecr_registry_url}/${project_name}/${environment}'
          chart: '{{chart_name}}'
          targetRevision: '{{chart_version}}'
          helm:
            valueFiles:
              - values.yaml
              - $app_values/infra/k8s/argocd/${environment}/{{app}}/values.yaml

        # Source 2: Application Values & Image Tags from Git
        - repoURL: '${github_repository_url}'
          targetRevision: '{{target_commit}}'
          ref: app_values

      destination:
        server: 'https://kubernetes.default.svc'
        namespace: default
      syncPolicy:
        automated:
          enabled: true
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

---

### 3.6 Terraform Variables & Module Plumbing

#### Modifications in `infra/terraform/k8s/`:
1. In `variables.tf`:
   * Remove outdated `targetRevision_api` and `targetRevision_worker`.
   * Add:
     ```terraform
     variable "targetRevision_app" {
       type        = string
       description = "Target Git revision/branch for application values (e.g. dev or {env}/app)"
     }

     variable "targetRevision_helm" {
       type        = string
       description = "Target Git revision/branch for Helm configs (e.g. dev or {env}/helm)"
     }

     variable "ecr_registry_url" {
       type        = string
       description = "AWS ECR registry domain (e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com)"
     }
     ```
2. In `k8s.tf`:
   * Pass the new variables and `ecr_registry_url` to `argocd_applicationset` template rendering.
3. In `environments/{env}/dev.tfvars`, `stg.tfvars`, `prod.tfvars`:
   * Set appropriate defaults for `targetRevision_app` and `targetRevision_helm` (defaulting to `"dev"` for local/trunk development).

---

## 4. Acceptance Criteria

- [ ] `infra/terraform/aws/modules/ecr/main.tf` defines repositories with slash namespaces (`${project}/${env}/api`, `${project}/${env}/worker`).
- [ ] `infra/terraform/aws/modules/eks/iam.tf` configures IAM policy, role, and EKS Pod Identity Association for `argocd-repo-server` in the `argocd` namespace.
- [ ] `infra/terraform/k8s/helm.tf` configures `reposerver.ecr.credential.helper=true` and `AWS_REGION` in the `argo-cd` Helm release.
- [ ] Directory layout `infra/k8s/argocd/${env}/` contains separated `api/`, `worker/`, `helm-api/`, and `helm-worker/` subdirectories with valid `config.json` files.
- [ ] `infra/terraform/k8s/manifests/argocd-applicationset.yaml` implements Matrix generators for both apps and renders Multiple Sources with `$app_values` pointing to ECR OCI charts.
- [ ] `infra/terraform/k8s/variables.tf` defines `targetRevision_app`, `targetRevision_helm`, and `ecr_registry_url`.
- [ ] All Terraform modules validate cleanly via `terraform validate`.
- [ ] Documentation registries (`docs/context/current-state.md` and `docs/progress/implementation-status.md`) are updated with Task 505 tracking.

# Task 506: Multi-Environment Helm Chart CI/CD Pipeline (`helm-cicd.yml`)

## 1. Goal

Implement an enterprise-grade, multi-environment, tag-driven CI/CD deployment pipeline for Helm charts in `.github/workflows/helm-cicd.yml`. The pipeline enforces a strict **"Package once in dev, promote identical immutable artifacts to stg/prod"** pattern using **Amazon ECR OCI registries**:

1. **Package Once in Dev**: Helm chart templates are packaged strictly once during development (`dev`) with dynamic versioning (`0.0.0-${SHORT_SHA}`) and pushed to the Dev ECR registry.
2. **Promote Identical OCI Artifacts**: Higher environments (`stg` and `prod`) **never re-package** chart source code. Instead, the workflow verifies and copies the exact immutable OCI artifact from the lower environment (`dev -> stg`, `stg -> prod`). If the chart does not exist in the lower environment registry, the pipeline fails fast.
3. **ArgoCD GitOps Sync**: Releases update `config.json` discovery pointers on `{env}/helm` branches under serialized concurrency locking, driving ArgoCD Multiple Sources reconciliation.

---

## 2. Prerequisites & Architecture References

* **Infrastructure Prerequisites (Task 505)**:
  * ECR repositories configured with slash namespaces (`${project_name}/${environment}/${app}`) in `infra/terraform/aws/modules/ecr/main.tf`.
  * EKS IAM Role and Pod Identity Association for `argocd-repo-server` with ECR pull permissions.
  * ArgoCD Helm release configured with `configs.params.reposerver\.ecr\.credential\.helper = "true"`.
  * Multi-Source Matrix `ApplicationSet` in `infra/terraform/k8s/manifests/argocd-applicationset.yaml` resolving OCI charts from ECR and values files from Git.
  * Directory layout established under `infra/k8s/argocd/${environment}/helm-${app}/config.json`.
* **Architecture Specifications**:
  * [Multi-Environment Infrastructure CI/CD Specification](file:///Users/parth/RAG/Document%20Intelligence%20Platform/docs/context/infrastructure-cicd-spec.md)
  * [Helm GitOps Multi-Source OCI & ApplicationSet Architecture Specification](file:///Users/parth/RAG/Document%20Intelligence%20Platform/docs/context/helm-gitops-multi-source-spec.md)

---

## 3. Workflow Trigger Configuration

The workflow `.github/workflows/helm-cicd.yml` supports three trigger modalities:

```yaml
name: Helm Chart CI/CD Pipeline

on:
  push:
    branches:
      - dev
    paths:
      - 'infra/k8s/helm/**'
    tags:
      - 'stg-helm-api-v*'
      - 'stg-helm-worker-v*'
      - 'prod-helm-api-v*'
      - 'prod-helm-worker-v*'
  workflow_dispatch:
    inputs:
      app:
        description: 'Select chart to package and deploy (dev only)'
        required: true
        type: choice
        options:
          - 'all'
          - 'api'
          - 'worker'
        default: 'all'
```

> **Note on Tag Triggers**: GitHub Actions evaluates tag push filters independently from `paths:`. Tags must reside at the top level of `on.push` rather than nested under `paths:`.

---

## 4. Pipeline Architecture & Execution Flow

The workflow is structured into three decoupled phases to maintain clean separation of concerns, execute parallel matrix artifact promotion, and eliminate git push race conditions:

```mermaid
flowchart TD
    Start(["Trigger: Push / Tag / Dispatch"]) --> Detect["Job 1: detect-and-matrix<br/>Resolve Environment, App & Commit SHA"]
    
    Detect --> EnvCheck{"Target Environment?"}
    
    %% Dev Branch Packaging (Build Once)
    EnvCheck -->|"Environment: dev"| DevPackage["Job 2: package-chart-dev<br/>helm lint & package --version 0.0.0-SHA<br/>Push OCI artifact to dev ECR"]
    
    %% Staging Promotion (Strict Copy Only)
    EnvCheck -->|"Environment: stg"| StgVerify{"Verify in dev ECR?<br/>aws ecr describe-images"}
    StgVerify -->|"Artifact NOT Found"| FailStg["🛑 ABORT PIPELINE (exit 1)<br/>Untested code cannot enter stg!<br/>Building in stg is strictly forbidden."]
    StgVerify -->|"Artifact Verified"| StgCopy["Job 2: promote-chart-stg<br/>COPY OCI Artifact: dev -> stg ECR<br/>Zero Rebuilding"]
    
    %% Production Promotion (Strict Copy Only)
    EnvCheck -->|"Environment: prod"| ProdVerify{"Verify in stg ECR?<br/>aws ecr describe-images"}
    ProdVerify -->|"Artifact NOT Found"| FailProd["🛑 ABORT PIPELINE (exit 1)<br/>Untested code cannot enter prod!<br/>Building in prod is strictly forbidden."]
    ProdVerify -->|"Artifact Verified"| ProdCopy["Job 2: promote-chart-prod<br/>COPY OCI Artifact: stg -> prod ECR<br/>Zero Rebuilding"]
    
    DevPackage --> Gate{"Manual Approval Gate<br/>GitHub Environment: stg/prod"}
    StgCopy --> Gate
    ProdCopy --> Gate
    
    Gate -->|"Approved / Dev Auto"| GitOps["Job 3: gitops-commit<br/>Serialized Downstream Commit<br/>Updates config.json & pushes"]
    
    GitOps -->|"dev"| PushDev["git push origin dev"]
    GitOps -->|"stg / prod"| PushRelease["git push origin {env}/helm"]
    
    PushDev --> Argo["ArgoCD Multiple Sources Reconciliation"]
    PushRelease --> Argo
```

---

## 5. Detailed Job Specifications

### 5.1 Job 1: `detect-and-matrix` (Environment, Version & Target Resolution)

* **Runs On**: `ubuntu-latest`
* **Outputs**:
  * `env`: Target deployment environment (`dev`, `stg`, `prod`).
  * `matrix`: JSON array of charts to process (e.g. `["api"]`, `["worker"]`, or `["api", "worker"]`).
  * `version`: Chart artifact version tag (`0.0.0-${SHORT_SHA}`).
  * `release_tag`: Semantic release tag for tracking in `stg`/`prod` (e.g. `1.0.0`).
  * `short_sha`: Git commit short SHA (`git rev-parse --short HEAD`).
  * `commit_sha`: Full 40-character commit SHA (`${{ github.sha }}`).

#### Operational Logic:
1. **Tag Trigger Detection (`stg` and `prod`)**:
   * If `github.ref_type == 'tag'`:
     * Matches format `{env}-helm-{app}-v{major}.{minor}.{patch}`.
     * Extracts `ENV` (`stg` or `prod`).
     * Extracts `APP` (`api` or `worker`).
     * Extracts `RELEASE_TAG` (stripping `{env}-helm-{app}-v` prefix).
     * Resolves the commit SHA pointed to by the tag: `SHORT_SHA=$(git rev-parse --short HEAD)`.
     * Immutable artifact version is always anchored to the commit: `VERSION="0.0.0-${SHORT_SHA}"`.
     * Sets `matrix=["${APP}"]`.
2. **Push / Dispatch Detection (`dev`)**:
   * If `github.event_name == 'push'` or `'workflow_dispatch'`:
     * Sets `ENV="dev"`.
     * Computes `SHORT_SHA=$(git rev-parse --short HEAD)`.
     * Sets `VERSION="0.0.0-${SHORT_SHA}"`.
     * Sets `RELEASE_TAG="0.0.0"`.
     * **Dynamic Path Inspection**:
       * If `workflow_dispatch` and `inputs.app != 'all'`: sets `matrix=["${inputs.app}"]`.
       * Otherwise, inspects changed files:
         * If `infra/k8s/helm/api/**` changed $\rightarrow$ include `"api"`.
         * If `infra/k8s/helm/worker/**` changed $\rightarrow$ include `"worker"`.
         * If neither or both changed (or `inputs.app == 'all'`) $\rightarrow$ sets `matrix=["api", "worker"]`.

---

### 5.2 Job 2: `package-or-promote` (Parallel OCI Packaging on Dev / Copy Promotion on Stg & Prod)

* **Needs**: `detect-and-matrix`
* **Runs On**: `ubuntu-latest`
* **Strategy**:
  ```yaml
  strategy:
    matrix:
      app: ${{ fromJson(needs.detect-and-matrix.outputs.matrix) }}
    fail-fast: true
  ```

> **Immutable Promotion Invariant**: 
> Helm charts are compiled/packaged **strictly once** in `dev`. In `stg` and `prod`, the workflow **never runs `helm package`** and never touches source manifests. It strictly verifies and copies the pre-built OCI artifact from the immediate lower environment (`dev -> stg`, `stg -> prod`). If the artifact is not found in the lower environment ECR repository, the job immediately aborts with `exit 1` to guarantee untested code can never be deployed to higher environments.

#### Step-by-Step Execution:

1. **Checkout Code**:
   * Uses `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) with `fetch-depth: 0`.
2. **Setup Tools**:
   * Installs Helm v3 (minimum 3.8+ for stable OCI registry commands) and Skopeo (or uses Helm OCI pull/push).
3. **AWS OIDC Authentication**:
   * Assumes CI IAM Role via `aws-actions/configure-aws-credentials` using `vars.TF_VAR_GITHUB_ACTIONS_CI_ROLE` and `vars.AWS_REGION`.
4. **Resolve ECR Registry Domain**:
   * Queries remote infrastructure output via `infra/terraform/query` against `infra/terraform/aws/environments/${{ env }}/backend.config.hcl` to retrieve `ecr_registry_url` (or defaults to `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com`).
5. **Helm Registry Login**:
   * Authenticates Helm directly against private AWS ECR:
     ```bash
     aws ecr get-login-password --region ${{ env.AWS_REGION }} | \
       helm registry login --username AWS --password-stdin "${{ steps.ecr.outputs.registry_domain }}"
     ```

#### Branch A: Development Environment (`env == 'dev'`) — Package Once
1. **Linting & Template Validation**:
   ```bash
   helm lint "infra/k8s/helm/${{ matrix.app }}"
   helm template "test-release" "infra/k8s/helm/${{ matrix.app }}" \
     -f "infra/k8s/helm/${{ matrix.app }}/values.yaml" \
     -f "infra/k8s/helm/${{ matrix.app }}/values.dev.yaml" > /dev/null
   ```
2. **Package Chart**:
   * Uses dynamic `--version` without modifying source files on disk:
     ```bash
     CHART_VERSION="${{ needs.detect-and-matrix.outputs.version }}"
     helm package "infra/k8s/helm/${{ matrix.app }}" --version "${CHART_VERSION}" --destination /tmp/charts
     ```
3. **Push to Dev ECR Registry**:
   ```bash
   TARGET_REPO="oci://${{ steps.ecr.outputs.registry_domain }}/${{ vars.TF_PROJECT_NAME }}/dev"
   helm push "/tmp/charts/${{ matrix.app }}-${CHART_VERSION}.tgz" "${TARGET_REPO}"
   ```

#### Branch B: Staging Environment (`env == 'stg'`) — Promote `dev -> stg`
1. **Verify Chart Existence in Dev ECR**:
   ```bash
   CHART_VERSION="${{ needs.detect-and-matrix.outputs.version }}"
   DEV_REPO="${{ vars.TF_PROJECT_NAME }}/dev/${{ matrix.app }}"
   
   TAG_EXISTS=$(aws ecr describe-images \
     --repository-name "${DEV_REPO}" \
     --image-ids imageTag="${CHART_VERSION}" \
     --query 'imageDetails[0].imageTags[0]' \
     --output text 2>/dev/null || echo "")

   if [ "$TAG_EXISTS" != "${CHART_VERSION}" ]; then
     echo "::error::Chart ${{ matrix.app }}:${CHART_VERSION} not found in dev ECR registry (${DEV_REPO}). You must build on dev first!"
     exit 1
   fi
   ```
2. **Copy Immutable OCI Artifact from Dev to Stg ECR**:
   * Using Helm OCI pull and push (or `skopeo copy`):
     ```bash
     # Pull exact byte-for-byte archive from dev ECR
     helm pull "oci://${{ steps.ecr.outputs.registry_domain }}/${{ vars.TF_PROJECT_NAME }}/dev/${{ matrix.app }}" \
       --version "${CHART_VERSION}" \
       --destination /tmp/charts

     # Push the identical archive to stg ECR
     helm push "/tmp/charts/${{ matrix.app }}-${CHART_VERSION}.tgz" \
       "oci://${{ steps.ecr.outputs.registry_domain }}/${{ vars.TF_PROJECT_NAME }}/stg"
     ```

#### Branch C: Production Environment (`env == 'prod'`) — Promote `stg -> prod`
1. **Verify Chart Existence in Stg ECR**:
   ```bash
   CHART_VERSION="${{ needs.detect-and-matrix.outputs.version }}"
   STG_REPO="${{ vars.TF_PROJECT_NAME }}/stg/${{ matrix.app }}"
   
   TAG_EXISTS=$(aws ecr describe-images \
     --repository-name "${STG_REPO}" \
     --image-ids imageTag="${CHART_VERSION}" \
     --query 'imageDetails[0].imageTags[0]' \
     --output text 2>/dev/null || echo "")

   if [ "$TAG_EXISTS" != "${CHART_VERSION}" ]; then
     echo "::error::Chart ${{ matrix.app }}:${CHART_VERSION} not found in staging ECR registry (${STG_REPO}). You must promote to staging first!"
     exit 1
   fi
   ```
2. **Copy Immutable OCI Artifact from Stg to Prod ECR**:
   ```bash
   # Pull exact byte-for-byte archive from staging ECR
   helm pull "oci://${{ steps.ecr.outputs.registry_domain }}/${{ vars.TF_PROJECT_NAME }}/stg/${{ matrix.app }}" \
       --version "${CHART_VERSION}" \
       --destination /tmp/charts

   # Push the identical archive to production ECR
   helm push "/tmp/charts/${{ matrix.app }}-${CHART_VERSION}.tgz" \
     "oci://${{ steps.ecr.outputs.registry_domain }}/${{ vars.TF_PROJECT_NAME }}/prod"
   ```

---

### 5.3 Job 3: `gitops-commit` (Serialized Multi-App Tracking Commit)

* **Needs**: `[detect-and-matrix, package-or-promote]`
* **Runs On**: `ubuntu-latest`
* **Environment Gate**: Binds to `environment: ${{ needs.detect-and-matrix.outputs.env }}` to enforce reviewer approval for `stg` and `prod`.
* **Concurrency Lock**:
  * For `dev`: `concurrency: git-commit-dev` (shared with Docker CI/CD workflows committing to `dev`).
  * For `stg` / `prod`: `concurrency: git-commit-${{ needs.detect-and-matrix.outputs.env }}-helm`.

#### Step-by-Step Execution:
1. **Checkout Target Branch**:
   * For `dev`: Checks out `dev` branch.
   * For `stg` / `prod`: Checks out `{env}/helm` release tracking branch (creating orphan branch if not yet existing).
2. **Update Discovery Configurations**:
   * For each packaged/promoted app in the matrix (`api`, `worker`, or both):
     * Updates `infra/k8s/argocd/${{ env }}/helm-${app}/config.json`:
       ```json
       {
         "app": "${app}",
         "chart_name": "${app}",
         "chart_version": "${CHART_VERSION}"
       }
       ```
3. **Selective Commit & Push with Rebase Loop**:
   * Configures git bot committer:
     ```bash
     git config --global user.name "github-actions[bot]"
     git config --global user.email "github-actions[bot]@users.noreply.github.com"
     ```
   * Stages only Helm configuration files:
     ```bash
     for app in "${APPS[@]}"; do
       git add "infra/k8s/argocd/${{ env }}/helm-${app}/config.json"
     done
     ```
   * Commits and pushes with rebase loop:
     ```bash
     git commit -m "release(helm): update charts [${APPS[*]}] to ${{ needs.detect-and-matrix.outputs.version }} [skip ci]" \
                -m "Environment: ${{ needs.detect-and-matrix.outputs.env }}" \
                -m "Release Tag: ${{ needs.detect-and-matrix.outputs.release_tag }}" \
                -m "Workflow Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
         || echo "No changes to commit"

     git pull --rebase origin "${TARGET_BRANCH}"
     git push origin HEAD:"${TARGET_BRANCH}"
     ```

---

## 6. Local Testing & Verification Strategy (`act`)

To verify the workflow locally without cloud deployment billing, provide local simulation fixtures under `.github/workflows/helm-cicd/`:

1. **Mock Event Fixtures**:
   * `events/push-dev.json`: Simulates push to `dev` touching `infra/k8s/helm/api/templates/deployment.yaml`.
   * `events/dev-all.json`: Simulates manual `workflow_dispatch` selecting `all`.
   * `events/tag-stg-api.json`: Simulates pushing tag `stg-helm-api-v1.0.0`.
   * `events/tag-prod-worker.json`: Simulates pushing tag `prod-helm-worker-v1.0.0`.
2. **Local Taskfile (`.github/workflows/helm-cicd/Taskfile.yaml`)**:
   * `task lint`: Runs `helm lint` across `api` and `worker` charts.
   * `task template-dev`: Dry-run renders manifests for `dev`.
   * `task test-push-dev`: Executes `act` simulation using `events/push-dev.json`.
   * `task test-tag-stg`: Executes `act` simulation using `events/tag-stg-api.json`.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] **Package Once Enforced**: Helm charts are compiled strictly in `dev`. Staging and production jobs run OCI copy routines without executing `helm package`.
- [ ] **Promotion Verification & Fail Fast**: Staging pipeline checks `dev` ECR and production pipeline checks `stg` ECR; fails with actionable error if lower environment artifact is absent.
- [ ] **Workflow File Created**: `.github/workflows/helm-cicd.yml` conforms to GitHub Actions syntax with all pinned action commit SHAs.
- [ ] **Dynamic Versioning Tested**: Dev packaging executes with `--version "0.0.0-${SHORT_SHA}"` without modifying working directory `Chart.yaml` files.
- [ ] **Parallel Matrix Execution**: Dev runs touching both charts correctly run `package-or-promote` for both `api` and `worker` concurrently.
- [ ] **Atomic GitOps Commits**: A single consolidated `gitops-commit` step updates both `config.json` files when both charts are built, preventing git push non-fast-forward conflicts.
- [ ] **Approval Gates Active**: Staging and production releases pause at the GitHub Environment gate before committing to `{env}/helm`.
- [ ] **ArgoCD Discovery Compatibility**: The emitted `config.json` schema strictly matches the keys expected by `infra/terraform/k8s/manifests/argocd-applicationset.yaml` (`chart_name`, `chart_version`, `app`).
- [ ] **Documentation Updated**: Update `docs/progress/implementation-status.md` and `docs/context/current-state.md` to reflect Task 506.

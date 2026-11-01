---
title: "CI/CD Pipelines Showcase"
description: "Visual walkthrough of GitHub Actions continuous delivery, matrix image packaging, automated GitOps commits, and promotion gates."
---

# CI/CD Pipelines Showcase

> Visual walkthrough of GitHub Actions automation — covering multi-environment release governance, parallel matrix container packaging, serialized GitOps commit synchronization, cross-stack Terraform coordination, manual staging review gates, and automated infrastructure teardown.

Infrastructure pipelines produce structured **GitHub Step Summaries** — contextual markdown reports embedded directly into the Actions run page.

---

## Multi-Environment Release Governance — All Workflow Runs

The GitHub Actions workflow execution history demonstrating the complete multi-environment deployment model in action:

- **Development (`dev`)**: Triggered via trunk branch push or manual dispatch (`workflow_dispatch`), orchestrating automated image builds, Helm chart packaging, and GitOps commit synchronization to the `dev` branch.
- **Staging Promotions (`stg-*` SemVer Tags)**: Higher environment promotions are triggered strictly by cutting semantic release tags per architectural concern:
    - Foundational AWS infrastructure: `stg-infra-aws-v1.0.0`
    - Containerized microservices: `stg-api-v1.0.0` and `stg-worker-v1.0.0`
    - OCI Helm chart templates: `stg-helm-api-v1.0.1` and `stg-helm-worker-v1.0.1`
    - Static frontend bundle: `stg-frontend-v1.0.1`
    - Kubernetes platform layer: `stg-infra-k8s-v1.0.0`

This proves the strict decoupled release cadences and immutable artifact promotion strategy without rebuilding binaries.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/pipeline runs.png" alt="All GitHub Actions Workflow Runs" />
</div>

---

## API & Worker Dev Pipeline — Matrix Build

A successful `api-worker-cicd.yml` run triggered on `dev`. The summary shows the parallel **Matrix strategy**: `Build or Promote (api)` and `Build or Promote (worker)` jobs run concurrently. The build summary confirms two Docker image variants built:

- **`22THC2`** (`full` — `ENVIRONMENT=dev`, includes Swagger UI) → tagged `${SHORT_SHA}`
- **`S3SDK4`** (`slim` — `ENVIRONMENT=prod`, Swagger stripped) → tagged `${SHORT_SHA}-slim`

The **Commit GitOps Tracking Release** job summary confirms the `values.yaml` update and the GitOps commit pushed to the `dev` tracking branch.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/01-api-worker-dev-pipeline.png.png" alt="API & Worker Dev Pipeline" />
</div>

---

## GitOps Commit Step — Updating Tracking Branch

The `Configure Target Branch & Update GitOps Configs` step log inside the `Commit GitOps Tracking Release` job. The log shows the exact git operations:

```
Updating infra/k8s/argocd/dev/api/values.yaml: repo=...docintel/dev/api, tag=0c43ae9
Updating infra/k8s/argocd/dev/worker/values.yaml: repo=...docintel/dev/worker, tag=0c43ae9
[dev 3f9337c] release(app): update container image(s) [api worker] to 0c43ae9 [skip ci]
Successfully pushed update commit to dev.
```

This is the **serialized GitOps commit** — concurrency group `git-commit-dev` prevents parallel workflows from colliding on this push.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/03-gitops-commit-job.png" alt="GitOps Commit Step" />
</div>

---

## AWS Infrastructure Pipeline — First Run (Placeholder Warning)

The `aws-deploy.yml` summary on initial greenfield deployment. The pipeline detects that K8s has not yet been deployed (no ALB DNS in K8s remote state), deploys CloudFront with a placeholder ALB origin, and emits an **actionable GitHub Step Summary** instructing the operator to re-run after the K8s pipeline completes.

This is the **ALB DNS Circular Dependency** resolution (Challenge #01) in practice.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/AWS-deploy.png" alt="AWS Deploy — First Run" />
</div>

---

## AWS Infrastructure Pipeline — Re-Run (ALB Aligned)

After `k8s-deploy.yml` has provisioned the Gateway and ALB, the re-run of `aws-deploy.yml` picks up the live ALB DNS from K8s remote state, updates the CloudFront origin, and reports success with a **Caution** note confirming the ALB DNS that CloudFront is now configured to proxy.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/AWS Re-Run.png" alt="AWS Deploy — Re-Run" />
</div>

---

## K8s Infrastructure Pipeline — Gateway ALB Provisioning Summary

The `k8s-deploy.yml` summary after provisioning the Kubernetes platform layer. The structured summary confirms:

- **Allocated Gateway ALB DNS**: dynamically assigned ELB hostname (e.g. `k8s-default-docintel-....us-east-1.elb.amazonaws.com`)
- **CloudFront Distribution Domain**: the provisioned CloudFront endpoint serving both frontend and API traffic
- **Next Action**: Re-run `aws-deploy.yml` to point CloudFront to the live ALB

This is the **GitHub Step Summary-driven operator guidance** pattern — no Slack alerts or external notifications needed.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/K8s-deploy.png" alt="K8s Deploy Summary" />
</div>

---

## Helm Chart CI Pipeline

The `helm-cicd.yml` pipeline: packages OCI Helm charts for the API and Worker, pushes them to the private ECR OCI registry, and commits the new chart version reference to the GitOps tracking branch.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/Helm-deploy.png" alt="Helm Deploy Pipeline" />
</div>

---

## Frontend Deploy Pipeline

The `frontend-deploy.yml` pipeline: builds the Next.js static export, archives it to the S3 artifact bucket, syncs to the target environment S3 bucket, and injects the runtime `config.js` with the correct API endpoint — without recompiling the application bundle.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Dev/frontend-deploy.png" alt="Frontend Deploy Pipeline" />
</div>

---

## Staging Manual Approval Gate

The GitHub Environment protection rule enforcement during a staging promotion. The pipeline halts at `Deploy Static Frontend (stg)` and surfaces the **"Review pending deployments"** dialog requiring explicit approval from `parth9218`. This is the **immutable artifact promotion** gate — the exact same frontend tarball built in dev is awaiting promotion.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/stg/manual review.png" alt="Staging Manual Approval" />
</div>

---

## Frontend `config.js` Injection — Staging

The `config.js` runtime injection step during the staging frontend deploy, confirming the API endpoint and environment values are written into the un-hashed `config.js` without recompiling the Next.js bundle.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/frontend config.js injection and S3 sync-stg.png" alt="Frontend Config.js Injection" />
</div>

---

## Technical Documentation Deployment Pipeline (GitHub Pages)

The `docs-deploy.yml` pipeline run deploying the MkDocs Material technical documentation to GitHub Pages. It shows the two-stage execution (`Build Documentation` and `Deploy to GitHub Pages`) and outputs a structured **Technical Documentation Deployment Summary** with the published URL, target branch, and commit hash.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/04-docs-deploy-pipelin.png" alt="Deploy Technical Documentation Pipeline" />
</div>

---

## Automated Infrastructure Teardown Pipeline

The `infra-destroy.yml` pipeline executing an automated teardown of cloud resources. It enforces strict reverse dependency teardown — destroying Kubernetes workloads and controllers (`Destroy K8s (stg)`) before attempting to tear down foundational cloud resources (`Destroy AWS (stg)`). The pipeline is protected by manual approval gates to prevent accidental resource destruction.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/cicd/Destroy Infra.png" alt="Destroy Infrastructure Pipeline" />
</div>

---
title: "ArgoCD GitOps Showcase"
description: "Visual walkthrough of ArgoCD Multi-Source ApplicationSet reconciliations, resource trees, and commit-pinned releases."
---

# ArgoCD GitOps Showcase

> Visual proof of continuous delivery governed declaratively via **ArgoCD v3.5.0** — showing Multi-Source ApplicationSet discovery, Kubernetes resource graphs for Express API and Python Worker workloads, and pinned commit SHA deployments.

Helm OCI charts are pulled from private AWS ECR; environment values are sourced from a pinned commit SHA on the Git tracking branch.

---

## ApplicationSet Overview — All Workloads Healthy

Both microservices (`docintel-dev-api` and `docintel-dev-worker`) show **Healthy + Synced** status. The `Target Revision` (`0.0.0-4d5435e`) corresponds to the OCI Helm chart version in ECR. The `Last Sync` timestamp confirms continuous reconciliation.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/argocd/01-applicationset-overview.png" alt="ArgoCD ApplicationSet Overview" />
</div>

---

## API Application Resource Graph

The `docintel-dev-api` application resource tree rendered by ArgoCD. Every Kubernetes resource managed by the Helm chart is visible and healthy:

| Resource | Kind | Purpose |
|---|---|---|
| `docintel-dev-api-service` | Service | ClusterIP for internal routing |
| `docintel-dev-api-sa` | ServiceAccount | Pod Identity binding target |
| `docintel-dev-api-deployment` | Deployment | Express API pods |
| `docintel-dev-api-tg-config` | TargetGroupConfig | ALB target group binding |
| `docintel-dev-api-httproute` | HTTPRoute | Gateway API north-south routing rule |
| `docintel-dev-api-interceptroute` | InterceptorRoute | KEDA HTTP Add-on intercept |
| `docintel-dev-api-http-scaler` | ScaledObject | KEDA autoscaling config |
| `docintel-dev-migration` | Job | Prisma migration job |

<div class="architecture-diagram">
  <img src="../../assets/screenshots/argocd/02-api-app-sync-detail.png" alt="API App Resource Graph" />
</div>

---

## Worker Application Resource Graph

The `docintel-dev-worker` resource tree. The worker chart is intentionally lighter than the API — no HTTPRoute, no InterceptorRoute. Key resources:

| Resource | Kind | Purpose |
|---|---|---|
| `docintel-dev-worker-sa` | ServiceAccount | Pod Identity binding for SQS + RDS access |
| `docintel-dev-worker-deployment` | Deployment | Python worker daemon |
| `docintel-dev-worker-sqs-scaler` | ScaledObject | KEDA `aws-sqs-queue` trigger (0→10) |
| `docintel-dev-worker-keda-aut...` | TriggerAuthentication | KEDA Pod Identity auth for SQS |

<div class="architecture-diagram">
  <img src="../../assets/screenshots/argocd/02-worker-app-sync-detail.png" alt="Worker App Resource Graph" />
</div>

---

## Multi-Source Application — Dev Environment

The **Sources** panel of the `docintel-dev-api` application, showing the two decoupled artifact sources reconciled by the Multi-Source ApplicationSet:

- **Source 1** — Private AWS ECR OCI Helm chart registry (`...dkr.ecr.us-east-1.amazonaws.com/docintel/dev`) at revision `0.0.0-4d5435e`
- **Source 2** — GitHub repository at `REVISION=dev` (dev branch tracks live trunk)

<div class="architecture-diagram">
  <img src="../../assets/screenshots/argocd/03-multi-source-detail-dev.png" alt="Multi-Source Detail — Dev" />
</div>

---

## Multi-Source Application — Staging Environment (Commit-Pinned)

The same Sources panel for the **staging** environment. The key difference from dev:

- **Source 1** — ECR revision `1.0.1` (a promoted semver-tagged OCI chart)
- **Source 2** — `REVISION=9fa4b31c16a9a6d65d2ecc45bb2bd304be140869` — a **fully pinned, immutable commit SHA** on the `stg/app` tracking branch

This is the commit-pinned GitOps model in practice: staging and production never track a branch pointer — they are locked to a specific audited commit.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/argocd/03-multi-source-detail-stg.png" alt="Multi-Source Detail — Staging (Pinned SHA)" />
</div>

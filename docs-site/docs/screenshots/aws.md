---
title: "AWS Cloud Infrastructure Showcase"
description: "Visual walkthrough of AWS cloud infrastructure console resources — EKS, Pod Identity Associations, SQS, RDS IAM DB auth, and CloudFront."
---

# AWS Cloud Infrastructure Showcase

> Visual inspection of AWS cloud resources provisioned via modular Terraform — covering Amazon EKS, EKS Pod Identity Associations, Amazon SQS event messaging, Amazon RDS PostgreSQL with IAM Database Authentication, and Amazon CloudFront dual-origin routing.

---

## EKS Cluster Overview

The `docintel-dev-eks-cluster` running on Amazon EKS. The cluster page confirms the cluster is active with managed node groups.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/01-eks-cluster.png" alt="EKS Cluster Overview" />
</div>

---

## EKS — Pod Identity Associations

The **Pod Identity Associations** tab — the modern successor to IRSA (IAM Roles for Service Accounts) that eliminates OIDC provider overhead. Six associations are configured, binding IAM roles to Kubernetes service accounts by namespace:

| Service Account | Namespace | IAM Role |
|---|---|---|
| `keda-operator` | keda | `docintel-dev-keda-operator-role` |
| `aws-load-balancer-controller` | kube-system | `docintel-dev-alb-controller` |
| `external-secrets` | external-secrets | `docintel-dev-external-secrets` |
| `docintel-dev-api-sa` | default | `docintel-dev-api-role` |
| `keda-metrics-server` | keda | `docintel-dev-keda-operator-role` |
| `docintel-dev-worker-sa` | default | `docintel-dev-worker-role` |

No OIDC provider. No annotated service accounts. No trust policy mutations per cluster. This is **ADR-019** in practice.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/01-eks-cluster-pod-identity-associations.png" alt="EKS Pod Identity Associations" />
</div>

---

## EKS — Installed Add-ons

The cluster's managed add-ons view, confirming the EKS-native components installed via Terraform.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/01-eks-cluster-addons.png" alt="EKS Add-ons" />
</div>

---

## EKS — Node Group

The managed node group provisioned for the cluster, showing the running EC2 instances.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/01-eks-cluster-Node.png" alt="EKS Node Group" />
</div>

---

## SQS — Ingestion Queue

The Amazon SQS queue powering the document ingestion pipeline. S3 `ObjectCreated` events are forwarded here; the Python worker's `boto3` long-poll loop (20s) consumes them. KEDA reads `ApproximateNumberOfMessagesVisible` from this queue to scale worker pods 0→10.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/02-sqs-queue.png" alt="SQS Queue" />
</div>

---

## RDS PostgreSQL — IAM Authentication Enabled

The Amazon RDS PostgreSQL 18 instance with **IAM Database Authentication** enabled — the key security invariant. Neither the API pod nor the worker pod ever stores a static database password. Instead, they generate short-lived IAM auth tokens (`@aws-sdk/rds-signer` / `boto3`) using their Pod Identity-bound IAM role, cached in-process for up to 10 minutes.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/03-rds-instance.png" alt="RDS IAM Auth" />
</div>

---

## CloudFront — Dual-Origin Distribution

The CloudFront distribution showing **both origins** configured on the single distribution:

| Origin | Type | Purpose |
|---|---|---|
| `docintel-dev-frontend-...s3...` | S3 | Serves static Next.js assets globally |
| `api-alb` | Elastic Load Balancing | Proxies `/api/*` requests to the internal Gateway ALB |

This is the **CloudFront unified routing** solution (ADR-021) that resolved browser mixed-content rejection: HTTPS frontend calling HTTP ALB, without purchasing a custom domain.

<div class="architecture-diagram">
  <img src="../../assets/screenshots/aws/CloudFront.png" alt="CloudFront Dual-Origin" />
</div>

---
title: "AWS Cloud Infrastructure Overview"
description: "Foundational AWS topology: VPC, EKS Auto Mode v1.37, RDS PostgreSQL pgvector, S3, SQS/DLQ, CloudFront, ACM, and ECR."
---

# AWS Cloud Infrastructure Overview

> Production-grade, environment-agnostic AWS infrastructure provisioned via modular Terraform, establishing zero-credential workload execution, edge-routed ingestion, and multi-AZ resilience.

---

## Architectural Role & Principles

The AWS cloud infrastructure establishes the foundational hosting, persistence, messaging, and compute platform for the AI Document Intelligence Platform.

- **EKS Auto Mode Compute (Kubernetes 1.37)**: Replaces legacy EC2 Managed Node Groups and manual launch templates with automated AWS-managed `general-purpose` and `system` node pools, delivering automated OS patching, right-sizing, and built-in EBS CSI storage integration.
- **Zero Static Credentials**: Workload pods assume IAM roles dynamically via native **EKS Pod Identity Associations**, while database connections utilize ephemeral 15-minute IAM tokens via `@aws-sdk/rds-signer`.
- **Direct S3 Multipart Ingestion**: Ingestion uploads completely bypass backend API instances; browser clients upload directly to S3 via presigned POST policies with storage-layer size and MIME validation.
- **Unified CloudFront Edge Routing**: A single CloudFront distribution routes static Single Page Application assets (`/*`) to Amazon S3 and API traffic (`/api/*`) to the internal Application Load Balancer, eliminating browser mixed-content rejections without requiring custom domain ACM certificates.
- **Strict Multi-AZ Network Isolation**: All compute pods and database instances operate exclusively in private subnets across two Availability Zones (`us-east-1a` and `us-east-1b`), accessing the internet via dedicated NAT Gateways.

---

## AWS Infrastructure Topology

The pre-rendered architecture topology below depicts the cloud primitives provisioned by the AWS Terraform layer:

<div class="panzoom-box">
  <div class="architecture-diagram">
    <img src="../../../assets/aws-infrastructure.png" alt="AWS Cloud Infrastructure Architecture Topology" />
  </div>
</div>

---

## Core Cloud Services Matrix

| AWS Service                       | Architecture Domain       | Operational Role & Configuration                                                                                                                                                                                   |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Amazon VPC**                    | Network Isolation         | Multi-AZ network across 2 AZs; 2 private subnets, 2 public subnets, 2 NAT Gateways, and DNS hostnames enabled.                                                                                                     |
| **Amazon EKS (Auto Mode)**        | Container Compute         | Managed Kubernetes 1.37 cluster with automated node pools (`general-purpose`, `system`), native managed add-ons (`eks-pod-identity-agent`, `aws-secrets-store-csi-driver-provider`), and CloudWatch audit logging. |
| **Amazon RDS PostgreSQL**         | Relational & Vector Store | Multi-AZ PostgreSQL 16 engine with native `pgvector` extension, IAM database authentication enabled, and dedicated db subnet group.                                                                                |
| **Amazon S3**                     | Storage & Static Assets   | Dual-bucket architecture: private Documents bucket (presigned multipart ingestion) and private Frontend bucket (static build hosting with OAC).                                                                    |
| **Amazon SQS & DLQ**              | Asynchronous Messaging    | S3 `ObjectCreated` event-driven queue; 20s long-polling, 600s visibility timeout, and Dead Letter Queue with 3-retry max receive count.                                                                            |
| **Amazon CloudFront**             | Global Edge Routing       | Dual-origin CDN distribution: S3 default origin for SPA assets and ALB custom origin for `/api/*` with `CachingDisabled` policy.                                                                                   |
| **Amazon ECR**                    | Container & OCI Registry  | Slash-delimited private repositories (`${project}/${env}/${app}`) hosting Docker container images and Helm OCI charts in identical namespaces.                                                                     |
| **AWS Secrets Manager & SSM**     | Configuration Management  | Dynamic storage of database credentials, HMAC session signing secrets, and environment parameters mounted into pods via CSI drivers.                                                                               |
| **AWS Certificate Manager (ACM)** | Transport Security        | TLS certificate management and automated domain validation for external load balancer listeners and CloudFront distributions.                                                                                      |

---

## Cross-Cutting Traffic & Security Flow

The sequence below illustrates the end-to-end cloud traversal across the AWS perimeter:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant CF as CloudFront Edge
    participant S3Doc as S3 Documents Bucket
    participant SQS as SQS Queue
    participant ALB as Application Load Balancer
    participant EKS as EKS Auto Mode Pods
    participant RDS as RDS PostgreSQL (pgvector)
    participant Bedrock as Amazon Bedrock

    rect rgb(240, 253, 250)
    note over User,CF: 1. Edge Ingress & Direct Storage Transfer
    User->>CF: GET / (Frontend SPA Assets)
    CF-->>User: Static React Chunks (from S3 Frontend)
    User->>CF: POST /api/documents (Upload Initiation)
    CF->>ALB: Proxy /api/* to Internal ALB
    ALB->>EKS: Route to Express API Pod
    EKS-->>User: Presigned POST Policy (Fields & Signature)
    User->>S3Doc: Multipart Upload Directly to S3 (Bypasses API)
    end

    rect rgb(236, 254, 255)
    note over S3Doc,EKS: 2. Asynchronous Event-Driven Ingestion
    S3Doc->>SQS: s3:ObjectCreated Event Notification
    SQS->>EKS: Worker Boto3 Long Poll (Visibility 600s)
    EKS->>S3Doc: Stream Document File
    EKS->>Bedrock: Embed Paragraph Chunks (Titan V2)
    Bedrock-->>EKS: 1024-dim Vector Embeddings
    EKS->>RDS: Upsert Document Chunks (pgvector <=> Index)
    EKS->>SQS: Acknowledge & Delete Message
    end

    rect rgb(255, 247, 237)
    note over User,RDS: 3. Grounded Retrieval & Token Streaming
    User->>CF: POST /api/query/search
    CF->>ALB: Proxy to Express API
    ALB->>EKS: Route to API Query Engine
    EKS->>Bedrock: Embed Search Query (Titan V2)
    EKS->>RDS: Cosine Similarity Search (WHERE session_id = $1)
    RDS-->>EKS: Top-5 Relevance Matches
    EKS->>Bedrock: Invoke Claude 3.5 Sonnet (Grounded Prompt)
    Bedrock-->>EKS: Token Stream with [n] Citations
    EKS-->>User: SSE Token Stream & Verified Citation Badges
    end
```

---

## Sub-Module Documentation

For in-depth module breakdowns and operational provisioning instructions, consult:

- [Terraform Modules Specification](terraform-modules.md): Detailed inputs, outputs, and resource mappings for all 8 AWS child modules.
- [Initial Provisioning Guide](initial-setup.md): Step-by-step CLI runbooks, backend state initialization, multi-environment isolation, and circular dependency resolution.

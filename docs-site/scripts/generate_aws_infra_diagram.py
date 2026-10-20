#!/usr/bin/env python3
"""
Generate AWS Infrastructure Diagram for infra/terraform/aws/README.md
Uses official AWS service icons via the Python `diagrams` library.
"""

import os
import shutil
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import CloudFront, VPC, InternetGateway, NATGateway, ALB
from diagrams.aws.compute import EKS, ECR
from diagrams.aws.storage import S3
from diagrams.aws.database import RDSPostgresqlInstance
from diagrams.aws.integration import SQS
from diagrams.aws.security import SecretsManager, CertificateManager, IAMRole
from diagrams.aws.management import SystemsManagerParameterStore
from diagrams.aws.ml import Bedrock
from diagrams.onprem.client import User

graph_attr = {
    "fontsize": "24",
    "fontname": "Helvetica Bold",
    "bgcolor": "#ffffff",
    "pad": "0.6",
    "splines": "spline",
    "nodesep": "0.8",
    "ranksep": "1.2",
    "dpi": "300",
}

node_attr = {
    "fontname": "Helvetica Bold",
    "fontsize": "11",
    "fontcolor": "#0f172a"
}

edge_attr = {
    "fontname": "Helvetica Bold",
    "fontsize": "9",
    "fontcolor": "#334155"
}

output_base = "docs-site/docs/assets/aws-infrastructure"

with Diagram(
    "AI Document Intelligence Platform — AWS Cloud Infrastructure",
    filename=output_base,
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr
):
    with Cluster("Client & Ingress Layer", graph_attr={"bgcolor": "#fdf4ff", "pencolor": "#d946ef", "style": "rounded,bold"}):
        user = User("Client Browser\n(React SPA / Next.js)")
        acm = CertificateManager("AWS ACM\n(*.docintel.com TLS)")

    with Cluster("Global Edge & Distribution", graph_attr={"bgcolor": "#f0fdfa", "pencolor": "#14b8a6", "style": "rounded,bold"}):
        cf = CloudFront("Amazon CloudFront\n(Unified Edge Ingress)")
        s3_frontend = S3("S3 Static Frontend\n(Exported React Assets)")

    with Cluster("Amazon VPC (10.0.0.0/16 — Multi-AZ: us-east-1a & us-east-1b)", graph_attr={"bgcolor": "#f8fafc", "pencolor": "#64748b", "style": "rounded,bold"}):
        igw = InternetGateway("Internet Gateway (IGW)")

        with Cluster("Public Subnets (AZ1 & AZ2)", graph_attr={"bgcolor": "#eff6ff", "pencolor": "#3b82f6", "style": "rounded"}):
            nat = NATGateway("Multi-AZ NAT Gateways\n(Outbound Internet)")
            alb = ALB("AWS Application Load Balancer\n(Kubernetes Gateway Target)")

        with Cluster("Private Subnets — Compute & Database", graph_attr={"bgcolor": "#fff7ed", "pencolor": "#f97316", "style": "rounded"}):
            with Cluster("Amazon EKS Cluster (Auto Mode v1.37)", graph_attr={"bgcolor": "#ffffff", "pencolor": "#ea580c", "style": "rounded"}):
                eks = EKS("Amazon EKS in Auto Mode\n(general-purpose & system)")

            with Cluster("Relational Persistence", graph_attr={"bgcolor": "#ffffff", "pencolor": "#ea580c", "style": "rounded"}):
                rds = RDSPostgresqlInstance("Amazon RDS PostgreSQL 16\n(pgvector + IAM DB Auth)")

    with Cluster("Asynchronous Messaging & Document Storage", graph_attr={"bgcolor": "#ecfeff", "pencolor": "#06b6d4", "style": "rounded,bold"}):
        s3_docs = S3("S3 Documents Bucket\n(KMS SSE Encrypted)")
        sqs_queue = SQS("Amazon SQS Queue\n(Long-Poll: 20s, Vis: 600s)")
        sqs_dlq = SQS("Dead-Letter Queue (DLQ)\n(MaxReceiveCount = 3)")

    with Cluster("Security, Configuration & Container Registry", graph_attr={"bgcolor": "#f5f3ff", "pencolor": "#8b5cf6", "style": "rounded,bold"}):
        ecr = ECR("Amazon ECR Registry\n(Docker & Helm OCI)")
        secrets = SecretsManager("AWS Secrets Manager\n(Database Credentials)")
        ssm = SystemsManagerParameterStore("SSM Parameter Store\n(/docintel/{env} Config)")
        pod_identity = IAMRole("EKS Pod Identity Roles\n(IAM Auth & Permissions)")

    with Cluster("Foundation AI & ML Services", graph_attr={"bgcolor": "#ecfdf5", "pencolor": "#10b981", "style": "rounded,bold"}):
        bedrock = Bedrock("Amazon Bedrock\n(Titan V2 & Claude 3.5)")

    # Client Ingress Connections
    user >> Edge(label="1. HTTPS Request", color="#0284c7") >> cf
    user >> Edge(label="2. Direct Presigned POST", color="#0284c7") >> s3_docs

    # CloudFront Edge Ingress
    cf >> Edge(label="Default /*", style="dashed", color="#0d9488") >> s3_frontend
    cf >> Edge(label="Reverse Proxy /api/*", color="#0d9488") >> alb
    alb >> Edge(label="Forward Target IP", color="#ea580c") >> eks
    acm >> Edge(label="Custom Domain TLS", style="dotted", color="#8b5cf6") >> cf

    # VPC Networking
    igw >> Edge(label="Public Inbound", style="dashed", color="#64748b") >> alb
    eks >> Edge(label="Egress via NAT", style="dashed", color="#64748b") >> nat
    nat >> Edge(style="dashed", color="#64748b") >> igw

    # Storage & SQS Messaging
    s3_docs >> Edge(label="s3:ObjectCreated:*", color="#0891b2") >> sqs_queue
    sqs_queue >> Edge(label="MaxRetries Exceeded", style="dotted", color="#ef4444") >> sqs_dlq
    eks >> Edge(label="Long Poll SQS", color="#ea580c") >> sqs_queue
    eks >> Edge(label="Download & Sniff", color="#0891b2") >> s3_docs

    # Database & Vectors
    eks >> Edge(label="IAM Token Connect & Vectors", color="#ea580c") >> rds

    # Security & Registry & Bedrock
    pod_identity >> Edge(label="Pod Identity Association", style="dotted", color="#7c3aed") >> eks
    secrets >> Edge(label="CSI Driver Sync", style="dotted", color="#7c3aed") >> eks
    ssm >> Edge(label="Config Sync", style="dotted", color="#7c3aed") >> eks
    ecr >> Edge(label="Pull Images & OCI Charts", style="dashed", color="#7c3aed") >> eks
    eks >> Edge(label="Embeddings & LLM Streaming", color="#059669") >> bedrock

print(f"Generated {output_base}.png successfully!")

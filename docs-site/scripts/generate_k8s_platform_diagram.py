#!/usr/bin/env python3
"""
Generate Kubernetes Platform & GitOps Architecture Diagram for infra/terraform/k8s/README.md
Uses official CNCF, Kubernetes, and AWS service icons via Python `diagrams`.
"""

import os
from diagrams import Diagram, Cluster, Edge
from diagrams.custom import Custom
from diagrams.k8s.ecosystem import Helm
from diagrams.k8s.network import Ingress, Service
from diagrams.k8s.compute import Pod, Deployment
from diagrams.k8s.podconfig import Secret
from diagrams.k8s.others import CRD
from diagrams.k8s.storage import Volume
from diagrams.onprem.gitops import Argocd
from diagrams.onprem.vcs import Git
from diagrams.aws.network import ALB
from diagrams.aws.compute import EKS, ECR
from diagrams.aws.integration import SQS
from diagrams.aws.security import SecretsManager

# Path to custom CNCF downloaded icons (using absolute path for Graphviz dot compatibility)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(SCRIPT_DIR, "icons")
keda_icon = os.path.join(ICONS_DIR, "keda.png")
eso_icon = os.path.join(ICONS_DIR, "eso.png")

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

output_base = os.path.join(SCRIPT_DIR, "../docs/assets/k8s-platform")

with Diagram(
    "AI Document Intelligence Platform — Kubernetes Platform & GitOps Architecture",
    filename=output_base,
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr
):
    with Cluster("External Sources & Event Triggers", graph_attr={"bgcolor": "#f8fafc", "pencolor": "#64748b", "style": "rounded,bold"}):
        git_repo = Git("Git Repository\n(Release Branches {env}/app)")
        ecr_oci = ECR("AWS ECR OCI Registry\n(Helm Charts: {{chart_version}})")
        sqs_queue = SQS("Amazon SQS Queue\n(Queue Depth Metrics)")
        aws_secrets = SecretsManager("AWS Secrets Manager\n& SSM Parameter Store")

    with Cluster("Amazon EKS Cluster (Auto Mode v1.37)", graph_attr={"bgcolor": "#f1f5f9", "pencolor": "#0284c7", "style": "rounded,bold"}):
        eks_plane = EKS("Amazon EKS Control Plane\n(Auto Mode & Pod Identity)")

        with Cluster("Gateway API & Ingress (Namespace: kube-system & default)", graph_attr={"bgcolor": "#eff6ff", "pencolor": "#3b82f6", "style": "rounded"}):
            gateway_crd = CRD("Gateway API CRDs\n(v1.6.1 Standard)")
            alb_helm = Helm("AWS LB Controller\nHelm Release (v3.5.0)")
            alb_controller = ALB("AWS LB Controller Pods\n(kube-system)")
            gateway_res = Ingress("Kubernetes Gateway\n& HTTPRoute (/api/*)")
            alb_helm >> Edge(style="dashed", color="#2563eb") >> alb_controller
            gateway_crd >> Edge(label="Declares Class alb", style="dashed", color="#3b82f6") >> gateway_res
            alb_controller >> Edge(label="Reconciles Ingress", color="#2563eb") >> gateway_res

        with Cluster("GitOps Engine (Namespace: argocd)", graph_attr={"bgcolor": "#fff7ed", "pencolor": "#f97316", "style": "rounded"}):
            argocd_helm = Helm("ArgoCD Helm Release\n(v10.3.0)")
            argocd = Argocd("ArgoCD Controller\n& ApplicationSet")
            argocd_secret = Secret("ECR Repository Secret\n(argocd.argoproj.io/secret-type)")
            argocd_helm >> Edge(style="dashed", color="#ea580c") >> argocd

        with Cluster("Secret Management (Namespace: external-secrets)", graph_attr={"bgcolor": "#f5f3ff", "pencolor": "#8b5cf6", "style": "rounded"}):
            eso_helm = Helm("ESO Helm Release\n(v2.12.0)")
            eso = Custom("External Secrets (ESO)\nController & CRDs", eso_icon)
            csi_driver = Volume("Secrets Store CSI\n(SecretProviderClass)")
            eso_helm >> Edge(style="dashed", color="#7c3aed") >> eso

        with Cluster("Event-Driven Autoscaling (Namespace: keda)", graph_attr={"bgcolor": "#fffbeb", "pencolor": "#f59e0b", "style": "rounded"}):
            keda_helm = Helm("KEDA Helm Releases\n(v2.20.2 & v0.15.0)")
            keda_core = Custom("KEDA SQS Scaler\n(ScaledObject 0→10)", keda_icon)
            keda_http = Custom("KEDA HTTP Interceptor\n(HTTP Add-on v0.15.0)", keda_icon)
            keda_helm >> Edge(style="dashed", color="#d97706") >> keda_core
            keda_helm >> Edge(style="dashed", color="#d97706") >> keda_http

        with Cluster("Application Workloads (Namespace: default)", graph_attr={"bgcolor": "#ecfdf5", "pencolor": "#10b981", "style": "rounded"}):
            with Cluster("Express API Microservice", graph_attr={"bgcolor": "#ffffff", "pencolor": "#059669", "style": "rounded"}):
                api_deploy = Deployment("API Deployment")
                api_svc = Service("API Service:3000")
                api_pod = Pod("API Pods (Node.js 24)")
                api_deploy >> api_pod
                api_svc >> api_pod

            with Cluster("Python Ingestion Worker", graph_attr={"bgcolor": "#ffffff", "pencolor": "#059669", "style": "rounded"}):
                worker_deploy = Deployment("Worker Deployment")
                worker_pod = Pod("Worker Pods (Python 3.11)")
                worker_deploy >> worker_pod

    # GitOps Synchronization Flows
    git_repo >> Edge(label="Source 2: Pinned Git Commit values.yaml", color="#ea580c") >> argocd
    ecr_oci >> Edge(label="Source 1: Immutable OCI Helm Chart", color="#ea580c") >> argocd
    eso >> Edge(label="Generates ECR Token Every 1h", style="dotted", color="#7c3aed") >> argocd_secret
    argocd_secret >> Edge(label="Authenticates ECR Pull", style="dotted", color="#7c3aed") >> argocd

    # ArgoCD Application Reconciliation
    argocd >> Edge(label="Reconciles Manifests", color="#059669") >> api_deploy
    argocd >> Edge(label="Reconciles Manifests", color="#059669") >> worker_deploy

    # Gateway API Routing
    gateway_res >> Edge(label="HTTPRoute IP Routing", color="#2563eb") >> api_svc

    # Secret Ingestion
    aws_secrets >> Edge(label="Sync via Pod Identity", style="dotted", color="#7c3aed") >> eso
    aws_secrets >> Edge(label="Volume Mount", style="dotted", color="#7c3aed") >> csi_driver
    csi_driver >> Edge(label="Injects Secret Volume", style="dotted", color="#7c3aed") >> api_pod
    csi_driver >> Edge(label="Injects Secret Volume", style="dotted", color="#7c3aed") >> worker_pod

    # KEDA Autoscaling Triggers
    keda_http >> Edge(label="Scales Replicas on HTTP Rate", style="dashed", color="#d97706") >> api_deploy
    sqs_queue >> Edge(label="Monitors Queue Length", style="dashed", color="#d97706") >> keda_core
    keda_core >> Edge(label="Scales Replicas (0→10)", style="dashed", color="#d97706") >> worker_deploy

print(f"Generated {output_base}.png successfully!")

import os
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import EKS
from diagrams.aws.network import CloudFront, ALB
from diagrams.aws.storage import S3
from diagrams.aws.database import RDSPostgresqlInstance
from diagrams.aws.integration import SQS
from diagrams.aws.ml import Bedrock
from diagrams.aws.security import SecretsManager
from diagrams.aws.management import AutoScaling
from diagrams.k8s.compute import Pod
from diagrams.onprem.client import User
from diagrams.onprem.gitops import Argocd

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

with Diagram(
    "AI Document Intelligence Platform — Production Architecture",
    filename="docs-site/docs/assets/architecture",
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr
):
    with Cluster("Client Interface", graph_attr={"bgcolor": "#fdf4ff", "pencolor": "#d946ef", "style": "rounded,bold"}):
        user = User("Client Browser\n(React SPA / Next.js)")

    with Cluster("Global Edge & CDN Layer", graph_attr={"bgcolor": "#f0fdfa", "pencolor": "#14b8a6", "style": "rounded,bold"}):
        cf = CloudFront("AWS CloudFront\n(Unified Ingress)")
        s3_static = S3("S3 Static Bucket\n(Exported SPA Assets)")
        cf >> Edge(label="Assets", style="dashed", color="#0d9488") >> s3_static

    with Cluster("AWS Storage & Asynchronous Messaging", graph_attr={"bgcolor": "#ecfeff", "pencolor": "#06b6d4", "style": "rounded,bold"}):
        s3_docs = S3("S3 Documents Bucket\n(KMS Encrypted)")
        sqs_queue = SQS("Amazon SQS Queue\n(Visibility: 600s)")
        sqs_dlq = SQS("Dead Letter Queue\n(DLQ Max: 3)")
        s3_docs >> Edge(label="s3:ObjectCreated:*", color="#0891b2") >> sqs_queue
        sqs_queue >> Edge(label="MaxRetries Exceeded", style="dotted", color="#ef4444") >> sqs_dlq

    with Cluster("Amazon EKS Cluster (Kubernetes 1.37)", graph_attr={"bgcolor": "#fff7ed", "pencolor": "#f97316", "style": "rounded,bold"}):
        with Cluster("Control Plane & Gateway", graph_attr={"bgcolor": "#ffffff", "pencolor": "#fdba74", "style": "rounded"}):
            eks_icon = EKS("Amazon EKS\n(v1.37 Managed)")
            alb = ALB("AWS Gateway API\n& ALB (HTTPRoute)")
        
        with Cluster("Cluster Controllers & Add-ons", graph_attr={"bgcolor": "#ffffff", "pencolor": "#fdba74", "style": "rounded"}):
            argocd = Argocd("ArgoCD Controller\n(Multi-Source OCI)")
            eso = SecretsManager("External Secrets (ESO)\n& CSI Driver")
            keda = AutoScaling("KEDA Autoscaler\n(SQS & HTTP Add-on)")

        with Cluster("Workload Pods", graph_attr={"bgcolor": "#ffffff", "pencolor": "#fdba74", "style": "rounded"}):
            api_pods = Pod("Express API Pods\n(Node.js / TypeScript)")
            worker_pods = Pod("Ingestion Worker Pods\n(Python / PyMuPDF)")

    with Cluster("Persistence & Foundation AI Models", graph_attr={"bgcolor": "#ecfdf5", "pencolor": "#10b981", "style": "rounded,bold"}):
        claude = Bedrock("Claude 3 Haiku\n(SSE Token Stream)")
        rds = RDSPostgresqlInstance("Amazon RDS PostgreSQL\n(pgvector HNSW Index)")
        titan = Bedrock("Titan Embeddings V2\n(1024-dim Vectors)")

    # Client Traffic
    user >> Edge(label="1. Request App", color="#0284c7") >> cf
    user >> Edge(label="2. Direct Multipart POST", color="#0284c7") >> s3_docs
    user >> Edge(label="3. Q&A Query & SSE", color="#0284c7") >> cf

    # CloudFront to EKS Ingress
    cf >> Edge(label="Forward /api/*", color="#0d9488") >> alb
    alb >> Edge(label="HTTPRoute", color="#ea580c") >> api_pods

    # Worker processing
    sqs_queue >> Edge(label="Long Poll (20s)", color="#ea580c") >> worker_pods
    s3_docs >> Edge(label="Fetch & Sniff", color="#0891b2") >> worker_pods
    worker_pods >> Edge(label="Embed Paragraphs", color="#059669") >> titan
    worker_pods >> Edge(label="Idempotent Upsert", color="#0891b2") >> rds

    # Retrieval & Q&A
    api_pods >> Edge(label="Session Cosine Search", color="#0891b2") >> rds
    api_pods >> Edge(label="Prompt & Context", color="#059669") >> claude
    rds >> Edge(label="PG NOTIFY Progress", style="dashed", color="#0891b2") >> api_pods

    # GitOps & Secrets & Dual Autoscaling
    argocd >> Edge(label="Sync", style="dashed", color="#94a3b8") >> api_pods
    argocd >> Edge(label="Sync", style="dashed", color="#94a3b8") >> worker_pods
    eso >> Edge(label="Secrets", style="dotted", color="#94a3b8") >> api_pods
    eso >> Edge(label="Secrets", style="dotted", color="#94a3b8") >> worker_pods
    keda >> Edge(label="Scales (HTTP Add-on)", style="dashed", color="#ea580c") >> api_pods
    keda >> Edge(label="Scales on SQS (0→10)", style="dashed", color="#ea580c") >> worker_pods

print("Production architecture diagram generated successfully!")

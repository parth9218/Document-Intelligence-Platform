resource "helm_release" "aws_load_balancer_controller" {
  name                       = "aws-load-balancer-controller"
  repository                 = "https://aws.github.io/eks-charts"
  chart                      = "aws-load-balancer-controller"
  namespace                  = "kube-system"
  version                    = "3.5.0"
  timeout                    = 600
  disable_openapi_validation = true

  set = [
    {
      name  = "clusterName"
      value = var.cluster_name
    },
    {
      name  = "serviceAccount.name"
      value = "aws-load-balancer-controller"
    },
    {
      name  = "serviceAccount.create"
      value = "true"
    },
    {
      name  = "enableGatewayAPI"
      value = "true"
    },
    {
      name  = "vpcId"
      value = var.vpc_id
    },
    {
      name  = "region"
      value = data.aws_region.current.region
    },
    {
      name    = "defaultTargetType",
      "value" = "ip"
    },
    {
      name  = "defaultLoadBalancerScheme",
      value = "internet-facing"
    }
  ]

  depends_on = [
    kubectl_manifest.crds
  ]
}


resource "helm_release" "argocd" {
  name                       = "argocd"
  repository                 = "https://argoproj.github.io/argo-helm"
  chart                      = "argo-cd"
  namespace                  = "argocd"
  version                    = "10.3.0"
  create_namespace           = true
  timeout                    = 600
  disable_openapi_validation = true
  # ArgoCD installs CRD-backed resources (Application, AppProject, etc.) that
  # Helm cannot verify as "ready" until the CRD controllers fully initialize.
  # This causes a false "failed" status even when all pods are healthy.
  # Setting wait=false tells Helm to submit resources and return without
  # blocking on readiness — ArgoCD's own health checks are the source of truth.
  wait = false
}

# KEDA 
resource "helm_release" "keda" {
  name             = "keda"
  repository       = "https://kedacore.github.io/charts"
  chart            = "keda"
  version          = "2.20.2"
  namespace        = "keda"
  create_namespace = true
  set = [{
    name  = "crds.install"
    value = true
  }]
}

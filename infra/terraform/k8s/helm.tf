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
}

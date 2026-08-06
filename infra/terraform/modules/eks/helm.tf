data "aws_region" "current" {}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "3.5.0"

  set = [
    {
      name  = "clusterName"
      value = module.eks.cluster_name
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
    module.eks,
    aws_eks_pod_identity_association.alb_controller
  ]
}


resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  namespace        = "argocd"
  version          = "10.3.0"
  create_namespace = true

  depends_on = [
    module.eks
  ]
}

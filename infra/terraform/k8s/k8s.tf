data "http" "crds" {
  url = "https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml"
}

resource "kubectl_manifest" "crds" {
  depends_on = [data.aws_eks_cluster.cluster_info]
  yaml_body  = data.http.crds.response_body
}

resource "kubectl_manifest" "alb_gatewayclass" {
  depends_on = [helm_release.aws_load_balancer_controller]
  yaml_body  = file("alb_gatewayclass.yaml")
}
resource "kubectl_manifest" "api_gateway" {
  depends_on = [kubectl_manifest.alb_gatewayclass]
  yaml_body = templatefile("api_gateway.yaml.tftpl", {
    domain_name  = var.api_domain,
    acm_cert_arn = var.acm_cert_arn
  })
}

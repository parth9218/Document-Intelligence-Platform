data "http" "crds" {
  url = "https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml"
}

data "kubectl_file_documents" "crds" {
  content = data.http.crds.response_body
}

resource "kubectl_manifest" "crds" {
  for_each  = data.kubectl_file_documents.crds.manifests
  yaml_body = each.value
}

resource "kubectl_manifest" "alb_gatewayclass" {
  depends_on = [
    kubectl_manifest.crds,
    helm_release.aws_load_balancer_controller
  ]
  yaml_body = file("manifests/alb_gatewayclass.yaml")
}

resource "kubectl_manifest" "api_gateway" {
  depends_on = [kubectl_manifest.alb_gatewayclass]
  yaml_body = templatefile("manifests/api_gateway.yaml", {
    project_name = var.project_name,
    environment  = var.environment,
    domain_name  = var.api_domain,
    acm_cert_arn = var.acm_cert_arn
  })
}
resource "kubectl_manifest" "storage_provider_class" {
  yaml_body = templatefile("manifests/secrets-provider-class.yaml", {
    project_name    = var.project_name,
    environment     = var.environment,
    parameters_name = var.ssm_parameters_name
    ssm_secret_name = var.ssm_secrets_name
  })
}

resource "kubectl_manifest" "argocd_applicationset" {
  yaml_body = templatefile("manifests/argocd-applicationset.yaml", {
    project_name          = var.project_name,
    environment           = var.environment,
    github_repository_url = var.github_repository_url,
    targetRevision        = var.targetRevision
  })
  depends_on = [
    helm_release.argocd,
    helm_release.keda,
    helm_release.keda-add-ons-http
  ]
}

resource "null_resource" "wait_for_alb_dns" {
  depends_on = [kubectl_manifest.api_gateway]

  provisioner "local-exec" {
    command = <<EOT
      aws eks update-kubeconfig --name ${var.cluster_name} --region ${data.aws_region.current.region} >/dev/null 2>&1
      echo "Waiting for ALB DNS to be populated on the Gateway resource..."
      while [ -z "$(kubectl get gateway ${var.project_name}-${var.environment}-api-gateway -o jsonpath='{.status.addresses[0].value}' 2>/dev/null)" ]; do
        sleep 5
      done
      ALB_DNS=$(kubectl get gateway ${var.project_name}-${var.environment}-api-gateway -o jsonpath='{.status.addresses[0].value}')
      echo "ALB successfully provisioned with DNS: $ALB_DNS"
    EOT
  }
}

data "external" "alb_dns" {
  depends_on = [null_resource.wait_for_alb_dns]
  program = ["bash", "-c", <<EOT
    aws eks update-kubeconfig --name ${var.cluster_name} --region ${data.aws_region.current.region} >/dev/null 2>&1
    DNS=$(kubectl get gateway ${var.project_name}-${var.environment}-api-gateway -o jsonpath='{.status.addresses[0].value}' 2>/dev/null || echo "")
    echo "{\"dns\": \"$DNS\"}"
EOT
  ]
}

output "eks_update-kubeconfig-cmd" {
  value = "aws eks update-kubeconfig --name ${var.cluster_name}"
}

output "argocd_port-forward-cmd" {
  value = "kubectl port-forward svc/argocd-server --address 0.0.0.0 -n argocd 8080:443"
}

output "argocd_initial_admin_password_cmd" {
  value = "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath={.data.password} | base64 -d"
}

output "api_alb_dns" {
  description = "The provisioned ALB DNS name for the API Gateway"
  value       = data.external.alb_dns.result["dns"]
}

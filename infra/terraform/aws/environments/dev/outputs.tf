output "vpc_id" {
  value = module.core.vpc_id
}
output "db_endpoint" {
  value = module.core.db_endpoint
}
output "db_password_secret" {
  value = module.core.db_password_secret
}
output "ssm_parameters_name" {
  value = module.core.ssm_parameters_name
}
output "ssm_secrets_name" {
  value = module.core.ssm_secrets_name
}
output "eks_cluster_name" {
  value = module.core.eks_cluster_name
}
output "cluster_endpoint" {
  value = module.core.cluster_endpoint
}
output "github_actions_ci_role" {
  value = module.core.github_actions_ci_role
}
output "acm_cert_arn" {
  value = module.core.acm_cert_arn
}
output "ecr_repo_urls" {
  value = module.core.ecr_repo_urls
}

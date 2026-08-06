output "vpc_id" {
  value = module.vpc.vpc_id
}
output "db_endpoint" {
  value = module.storage.db_address
}
output "db_password_secret" {
  value = module.storage.db_password_secret
}
output "ssm_secrets_arn" {
  value = module.secrets.secrets_arn
}
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}
output "github_actions_ci_role" {
  value = module.oidc.github_actions_ci_role_arn
}

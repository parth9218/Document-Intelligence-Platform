output "vpc_id" {
  value = module.vpc.vpc_id
}
output "db_endpoint" {
  value = module.storage.db_address
}
output "db_password_secret" {
  value = module.storage.db_password_secret
}
output "ssm_parameters_name" {
  value = module.secrets.ssm_parameter_name
}
output "ssm_secrets_name" {
  value = module.secrets.ssm_secrets_name
}
output "eks_cluster_name" {
  value = module.eks.cluster_name
}
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}
output "cluster_certificate_authority_data" {
  value = module.eks.cluster_certificate_authority_data
}
output "acm_cert_arn" {
  value = module.acm.acm_cert_arn
}
output "ecr_repo_urls" {
  value = module.ecr.ecr_repo_urls
}
output "cloudfront_domain" {
  value = module.storage.cloudfront_domain
}
output "frontend_bucket_id" { value = module.storage.frontend_bucket_id }

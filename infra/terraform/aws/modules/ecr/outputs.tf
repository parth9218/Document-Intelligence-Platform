output "ecr_repo_urls" {
  value = [for repo in aws_ecr_repository.images : repo.repository_url]
}
output "ecr_repo_arns" {
  value = [for repo in aws_ecr_repository.images : repo.arn]
}
output "ecr_registry_url" {
  value = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com"
}

output "ecr_repo_urls" {
  value = [for repo in aws_ecr_repository.images : repo.repository_url]
}
output "ecr_repo_arns" {
  value = [for repo in aws_ecr_repository.images : repo.arn]
}

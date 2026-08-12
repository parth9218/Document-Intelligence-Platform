output "ecr_repo_arns" {
  value = [for repo in aws_ecr_repository.images : repo.arn]
}

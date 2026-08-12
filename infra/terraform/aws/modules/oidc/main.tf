data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_actions_ci_role = "${var.project_name}-${var.environment}-github-actions-ci"
}

resource "aws_iam_role" "github_actions_ci" {
  name = local.github_actions_ci_role

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringLike = {
            # ONLY allow your specific GitHub repo to assume this role!
            "token.actions.githubusercontent.com:sub" : "repo:${var.github_username}/${var.github_repo}:*"
          }
        }
      }
    ]
  })

  tags = {
    Name = local.github_actions_ci_role
  }
}

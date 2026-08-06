locals {
  repositories = [
    "${var.project_name}-${var.environment}-api",
    "${var.project_name}-${var.environment}-worker"
  ]
}

resource "aws_ecr_repository" "images" {
  for_each = toset(local.repositories)

  name                 = each.value
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = each.value
  }
}

data "aws_iam_policy_document" "ecr_policy" {
  statement {
    sid    = "AllowPushFromCI"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [var.ci_role_arn]
    }
    actions = [
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:BatchCheckLayerAvailability"
    ]
  }
}

resource "aws_ecr_repository_policy" "ecr_policies" {
  for_each = toset(local.repositories)

  repository = aws_ecr_repository.images[each.value].name
  policy     = data.aws_iam_policy_document.ecr_policy.json
}

resource "aws_ecr_lifecycle_policy" "ecr_lifecycle_policies" {
  for_each = toset(local.repositories)

  repository = aws_ecr_repository.images[each.value].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images",
        selection = {
          tagStatus     = "tagged",
          tagPrefixList = ["v"],
          countType     = "imageCountMoreThan",
          countNumber   = 10
        },
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire images older than 1 day (AWS minimum limit)"
        selection = {
          tagStatus   = "any"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Add AWSSecretsManagerClientReadOnlyAccess managed policy to all the roles below
data "aws_iam_policy_document" "api_policy" {
  statement {
    actions = [
      "rds-db:connect"
    ]
    resources = [
      "${var.rds_db_arn}"
    ]
  }
  statement {
    actions = [
      "s3:PutObject",
      "s3:GetObject"
    ]
    resources = [
      "${var.documents_bucket_arn}/*"
    ]
  }
  statement {
    actions = [
      "bedrock:InvokeModel"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "api_policy" {
  name   = "${var.project_name}-${var.environment}-api-policy"
  policy = data.aws_iam_policy_document.api_policy.json
}

data "aws_iam_policy_document" "worker_policy" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
      "ssm:GetParameter",
      "ssm:GetParameters"
    ]
    resources = [var.db_credentials_arn]
  }
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:SendMessage"
    ]
    resources = [var.documents_sqs_arn]
  }
  statement {
    actions = [
      "rds-db:connect"
    ]
    resources = [
      "${var.rds_db_arn}"
    ]
  }
  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket"
    ]
    resources = [
      var.documents_bucket_arn,
      "${var.documents_bucket_arn}/*"
    ]
  }
  statement {
    actions = [
      "bedrock:InvokeModel"
    ]
    resources = ["*"]
  }
  policy_id = "AWSSecretsManagerClientReadOnlyAccess"
}

resource "aws_iam_policy" "worker_policy" {
  name   = "${var.project_name}-${var.environment}-worker-policy"
  policy = data.aws_iam_policy_document.worker_policy.json
}

resource "aws_iam_role" "worker_role" {
  name = "${var.project_name}-${var.environment}-worker-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "pods.eks.amazonaws.com"
        }
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
      }
    ]
  })
}

resource "aws_iam_role" "api_role" {
  name = "${var.project_name}-${var.environment}-api-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "pods.eks.amazonaws.com"
        }
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
      }
    ]
  })
}

locals {
  worker_policy_arns = [
    aws_iam_policy.worker_policy.arn,
    "arn:aws:iam::aws:policy/AWSSecretsManagerClientReadOnlyAccess"
  ]
  api_policy_arns = [
    aws_iam_policy.api_policy.arn,
    "arn:aws:iam::aws:policy/AWSSecretsManagerClientReadOnlyAccess"
  ]
}

resource "aws_iam_role_policy_attachment" "api_policy_attachment" {
  for_each   = toset(local.api_policy_arns)
  role       = aws_iam_role.api_role.name
  policy_arn = each.value
}

resource "aws_eks_pod_identity_association" "api" {
  cluster_name    = module.eks.cluster_name
  namespace       = "default"
  service_account = "api-sa"
  role_arn        = aws_iam_role.api_role.arn
}

resource "aws_iam_role_policy_attachment" "worker_policy_attachment" {
  for_each   = toset(local.worker_policy_arns)
  role       = aws_iam_role.worker_role.name
  policy_arn = each.value
}

resource "aws_eks_pod_identity_association" "worker" {
  cluster_name    = module.eks.cluster_name
  namespace       = "default"
  service_account = "worker-sa"
  role_arn        = aws_iam_role.worker_role.arn
}


# ALB Controller IAM Role
resource "aws_iam_role" "alb_controller" {
  name = "${var.project_name}-${var.environment}-alb-controller"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "pods.eks.amazonaws.com"
        }
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
      }
    ]
  })
}

data "http" "alb_controller_policy" {
  url = "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json"
}

resource "aws_iam_role_policy" "alb_controller" {
  name   = "AWSLoadBalancerControllerIAMPolicy"
  role   = aws_iam_role.alb_controller.id
  policy = data.http.alb_controller_policy.response_body
}

resource "aws_eks_pod_identity_association" "alb_controller" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.alb_controller.arn
}

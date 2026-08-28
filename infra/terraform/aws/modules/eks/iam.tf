data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "api_policy" {
  statement {
    actions = [
      "rds-db:connect"
    ]
    resources = [
      "arn:aws:rds-db:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:dbuser:${var.dbi_resource_id}/${var.db_username}"
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
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ]
    resources = ["*"]
  }
  statement {
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath"
    ]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/*"
    ]
  }
  statement {
    actions = [
      "kms:Decrypt"
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
      "ssm:GetParameters",
      "ssm:GetParametersByPath"
    ]
    resources = [
      var.db_credentials_arn,
      "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/*"
    ]
  }
  statement {
    actions = [
      "kms:Decrypt"
    ]
    resources = ["*"]
  }
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:SendMessage"
    ]
    resources = [
      var.documents_sqs_arn,
      var.documents_dlq_arn
    ]
  }
  statement {
    actions = [
      "rds-db:connect"
    ]
    resources = [
      "arn:aws:rds-db:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:dbuser:${var.dbi_resource_id}/${var.db_username}"
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

data "aws_iam_policy_document" "assume-role-policy-document" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
  }
}

data "aws_iam_policy_document" "worker_assume_role_policy" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
  }
  statement {
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.keda_operator_role.arn]
    }
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
  }
}

resource "aws_iam_role" "worker_role" {
  name               = "${var.project_name}-${var.environment}-worker-role"
  assume_role_policy = data.aws_iam_policy_document.worker_assume_role_policy.json
}

resource "aws_iam_role" "api_role" {
  name               = "${var.project_name}-${var.environment}-api-role"
  assume_role_policy = data.aws_iam_policy_document.assume-role-policy-document.json
}

locals {
  worker_policy_arns = {
    custom              = aws_iam_policy.worker_policy.arn
    secretsmanager_read = "arn:aws:iam::aws:policy/AWSSecretsManagerClientReadOnlyAccess"
  }
  api_policy_arns = {
    custom              = aws_iam_policy.api_policy.arn
    secretsmanager_read = "arn:aws:iam::aws:policy/AWSSecretsManagerClientReadOnlyAccess"
  }
}

resource "aws_iam_role_policy_attachment" "api_policy_attachment" {
  for_each   = local.api_policy_arns
  role       = aws_iam_role.api_role.name
  policy_arn = each.value
}

resource "aws_eks_pod_identity_association" "api" {
  cluster_name    = module.eks.cluster_name
  namespace       = "default"
  service_account = "${var.project_name}-${var.environment}-api-sa"
  role_arn        = aws_iam_role.api_role.arn
}

resource "aws_iam_role_policy_attachment" "worker_policy_attachment" {
  for_each   = local.worker_policy_arns
  role       = aws_iam_role.worker_role.name
  policy_arn = each.value
}

resource "aws_eks_pod_identity_association" "worker" {
  cluster_name    = module.eks.cluster_name
  namespace       = "default"
  service_account = "${var.project_name}-${var.environment}-worker-sa"
  role_arn        = aws_iam_role.worker_role.arn
}


# ALB Controller IAM Role
resource "aws_iam_role" "alb_controller" {
  name               = "${var.project_name}-${var.environment}-alb-controller"
  assume_role_policy = data.aws_iam_policy_document.assume-role-policy-document.json
}

resource "aws_iam_role_policy" "alb_controller" {
  name = "AWSLoadBalancerControllerIAMPolicy"
  role = aws_iam_role.alb_controller.id
  // Policy had to be downloaded because of frequent "429 Too Many Requests" errors from Github
  // https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
  policy = file("${path.module}/iam_policy.json")
}

resource "aws_eks_pod_identity_association" "alb_controller" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.alb_controller.arn
}

# KEDA Operator Role for assuming workload identities
resource "aws_iam_role" "keda_operator_role" {
  name               = "${var.project_name}-${var.environment}-keda-operator-role"
  assume_role_policy = data.aws_iam_policy_document.assume-role-policy-document.json
}

data "aws_iam_policy_document" "keda_assume_workload" {
  statement {
    actions = [
      "sts:AssumeRole",
      "sts:TagSession"
    ]
    resources = [
      aws_iam_role.worker_role.arn
    ]
  }
}

resource "aws_iam_role_policy" "keda_assume_workload" {
  name   = "KEDAAssumeWorkloadRole"
  role   = aws_iam_role.keda_operator_role.id
  policy = data.aws_iam_policy_document.keda_assume_workload.json
}

resource "aws_eks_pod_identity_association" "keda_operator" {
  cluster_name    = module.eks.cluster_name
  namespace       = "keda"
  service_account = "keda-operator"
  role_arn        = aws_iam_role.keda_operator_role.arn
}

resource "aws_eks_pod_identity_association" "keda_metrics_server" {
  cluster_name    = module.eks.cluster_name
  namespace       = "keda"
  service_account = "keda-metrics-server"
  role_arn        = aws_iam_role.keda_operator_role.arn
}

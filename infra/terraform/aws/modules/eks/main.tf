locals {
  eks_name = "${var.project_name}-${var.environment}-eks-cluster"
}

data "aws_iam_policy_document" "node_role_boundary" {
  statement {
    sid    = "AllowPullFromECRBoundary"
    effect = "Deny"
    actions = [
      "ecr:*"
    ]
    not_resources = concat(var.ecr_repo_arns, )
  }
}

resource "aws_iam_policy" "node_role_boundary" {
  name   = "${local.eks_name}-node-role-boundary"
  policy = data.aws_iam_policy_document.node_role_boundary.json
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.eks_name
  kubernetes_version = "1.36"

  # Optional
  endpoint_public_access = true

  # Optional: Adds the current caller identity as an administrator via cluster access entry
  enable_cluster_creator_admin_permissions = true

  compute_config = {
    enabled    = true
    node_pools = ["general-purpose", "system"]
  }

  # attach node role boundary to restrict permissions to the ecr repos in module.ecr only
  # node_iam_role_permissions_boundary = aws_iam_policy.node_role_boundary.arn

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  addons = {
    eks-pod-identity-agent = {
      before_compute = true
    }
    aws-secrets-store-csi-driver-provider = {
      configuration_values = jsonencode({
        secrets-store-csi-driver : {
          rotationPollInterval : "120s",
          syncSecret : {
            enabled : true
          },
          tokenRequests : [{
            audience : "pods.eks.amazonaws.com"
          }]
        }
      })
    }
  }

  tags = {
    Name = local.eks_name
  }
}


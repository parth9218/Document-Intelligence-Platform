locals {
  eks_name = "${var.project_name}-${var.environment}-eks-cluster"
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

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  addons = {
    eks-pod-identity-agent = {
      before_compute = true
    }
  }

  tags = {
    Name = local.eks_name
  }
}


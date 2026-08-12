terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.57.1"
    }
    tls = {
      source  = "hashicorp/tls",
      version = ">= 4.3.0"
    }
  }
}

provider "aws" {
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = [for i, c in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  public_subnets  = [for i, c in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 101)]
}

module "vpc" {
  source          = "../../modules/vpc"
  project_name    = var.project_name
  environment     = var.environment
  vpc_cidr        = var.vpc_cidr
  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets
  azs             = local.azs
}

module "secrets" {
  source       = "../../modules/secrets"
  project_name = var.project_name
  environment  = var.environment
}

module "storage" {
  source                 = "../../modules/storage"
  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  private_subnets        = module.vpc.private_subnets
  db_name                = var.db_name
  db_user_name           = var.db_username
  region                 = data.aws_region.current.region
  account_id             = data.aws_caller_identity.current.account_id
  github_actions_ci_role = module.oidc.github_actions_ci_role_arn
}

module "oidc" {
  source          = "../../modules/oidc"
  project_name    = var.project_name
  environment     = var.environment
  github_username = var.github_username
  github_repo     = var.github_repo
}

module "ecr" {
  source       = "../../modules/ecr"
  project_name = var.project_name
  environment  = var.environment
  ci_role_arn  = module.oidc.github_actions_ci_role_arn
}

module "eks" {
  source               = "../../modules/eks"
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = [for subnet in module.vpc.private_subnets : subnet.id]
  rds_db_arn           = module.storage.db_arn
  db_credentials_arn   = module.secrets.secrets_arn
  ecr_repo_arns        = module.ecr.ecr_repo_arns
  documents_sqs_arn    = module.messaging.sqs_queue_arn
  documents_bucket_arn = module.storage.documents_bucket_arn
}

module "messaging" {
  source               = "../../modules/messaging"
  project_name         = var.project_name
  environment          = var.environment
  documents_bucket_id  = module.storage.documents_bucket_id
  documents_bucket_arn = module.storage.documents_bucket_arn
}

module "acm" {
  source       = "../../modules/acm"
  project_name = var.project_name
  environment  = var.environment
  api_hostname = var.api_hostname
}

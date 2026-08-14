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
  source          = "../vpc"
  project_name    = var.project_name
  environment     = var.environment
  vpc_cidr        = var.vpc_cidr
  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets
  azs             = local.azs
}

module "secrets" {
  source       = "../secrets"
  project_name = var.project_name
  environment  = var.environment
}

module "storage" {
  source                 = "../storage"
  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  private_subnets        = module.vpc.private_subnets
  db_name                = var.db_name
  db_user_name           = var.db_username
  region                 = data.aws_region.current.region
  account_id             = data.aws_caller_identity.current.account_id
  github_actions_ci_role = var.github_actions_ci_role
}

module "ecr" {
  source       = "../ecr"
  project_name = var.project_name
  environment  = var.environment
  ci_role_arn  = var.github_actions_ci_role
}

module "eks" {
  source               = "../eks"
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = [for subnet in module.vpc.private_subnets : subnet.id]
  rds_db_arn           = module.storage.db_arn
  db_credentials_arn   = module.storage.db_password_secret
  ecr_repo_arns        = module.ecr.ecr_repo_arns
  documents_sqs_arn    = module.messaging.sqs_queue_arn
  documents_bucket_arn = module.storage.documents_bucket_arn
  admin_user_arns      = var.admin_user_arns
}

module "messaging" {
  source               = "../messaging"
  project_name         = var.project_name
  environment          = var.environment
  documents_bucket_id  = module.storage.documents_bucket_id
  documents_bucket_arn = module.storage.documents_bucket_arn
}

module "acm" {
  source       = "../acm"
  project_name = var.project_name
  environment  = var.environment
  api_hostname = var.api_hostname
}

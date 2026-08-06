terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.57.1"
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
  source          = "../../modules/storage"
  project_name    = var.project_name
  environment     = var.environment
  vpc_id          = module.vpc.vpc_id
  private_subnets = module.vpc.private_subnets
  db_name         = var.db_name
  db_user_name    = var.db_username
  region          = data.aws_region.current.region
  account_id      = data.aws_caller_identity.current.account_id
}

module "eks" {
  source             = "../../modules/eks"
  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = [for subnet in module.vpc.private_subnets : subnet.id]
}

module "messaging" {
  source               = "../../modules/messaging"
  project_name         = var.project_name
  environment          = var.environment
  documents_bucket_id  = module.storage.documents_bucket_id
  documents_bucket_arn = module.storage.documents_bucket_arn
}

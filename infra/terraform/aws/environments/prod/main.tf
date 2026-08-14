terraform {
  required_version = ">= 1.15.0"
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

module "core" {
  source                 = "../../modules/core"
  project_name           = var.project_name
  environment            = var.environment
  vpc_cidr               = var.vpc_cidr
  tags                   = var.tags
  db_name                = var.db_name
  db_username            = var.db_username
  api_hostname           = var.api_hostname
  github_actions_ci_role = var.github_actions_ci_role
}

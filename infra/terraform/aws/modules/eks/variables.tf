variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "dbi_resource_id" { type = string }
variable "db_credentials_arn" { type = string }
variable "documents_sqs_arn" { type = string }
variable "documents_dlq_arn" { type = string }
variable "documents_bucket_arn" { type = string }
variable "ecr_repo_arns" { type = list(string) }
variable "db_username" { type = string }


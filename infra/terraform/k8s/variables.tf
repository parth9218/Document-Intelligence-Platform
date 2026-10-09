variable "cluster_name" {
  type = string
}
variable "vpc_id" {
  type = string
}
variable "api_domain" {
  type = string
}
variable "acm_cert_arn" {
  type = string
}
variable "ssm_parameters_name" {
  type = string
}
variable "ssm_secrets_name" {
  type = string
}
variable "project_name" {
  type = string
}
variable "environment" {
  type = string
}
variable "github_repository_url" {
  type = string
}
variable "targetRevision_app" {
  type        = string
  description = "Target Git revision/branch for application values (e.g. dev or {env}/app)"
  default     = "dev"
}
variable "targetRevision_helm" {
  type        = string
  description = "Target Git revision/branch for Helm configs (e.g. dev or {env}/helm)"
  default     = "dev"
}
variable "ecr_registry_url" {
  type        = string
  description = "AWS ECR registry domain (optional, defaults to current account/region)"
  default     = ""
}
variable "targetRevision_api" {
  type        = string
  description = "Deprecated: Use targetRevision_app"
  default     = null
}
variable "targetRevision_worker" {
  type        = string
  description = "Deprecated: Use targetRevision_helm"
  default     = null
}

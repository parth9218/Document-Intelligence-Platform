variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnets" {
  type = list(object({
    id   = string
    cidr = string
  }))
}
variable "db_name" { type = string }
variable "db_user_name" { type = string }
variable "account_id" { type = string }
variable "region" { type = string }
variable "github_actions_ci_role" { type = string }
variable "api_alb_dns_name" {
  type        = string
  description = "DNS name of the API ALB (e.g. k8s-default-xxx.elb.amazonaws.com). Used as the CloudFront custom origin."
}

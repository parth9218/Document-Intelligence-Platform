variable "project_name" {
  type    = string
  default = "docintel"
}
variable "environment" {
  type    = string
  default = "dev"
}
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "db_name" {
  type    = string
  default = "docintel"
}
variable "db_username" {
  type    = string
  default = "postgres"
}
variable "api_hostname" {
  type    = string
  default = "api.dev.docintel.com"
}
variable "github_actions_ci_role" {
  type = string
}

variable "admin_user_arns" {
  type    = list(string)
  default = []
}

variable "api_alb_dns_name" {
  type        = string
  description = "DNS name of the ALB provisioned for the API Gateway by the k8s Terraform layer. Run `kubectl get gateway -n default` to retrieve this value after the k8s layer is applied."
  default     = "k8s-default-460689612.us-east-1.elb.amazonaws.com"
}


variable "project_name" {
  type    = string
  default = "docintel"
}
variable "environment" {
  type    = string
  default = "prod"
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
  default = "api.docintel.com"
}
variable "github_actions_ci_role" {
  type = string
}

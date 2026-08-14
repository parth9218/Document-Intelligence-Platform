variable "project_name" {
  type = string
}
variable "environment" {
  type = string
}
variable "vpc_cidr" {
  type = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "db_name" {
  type = string
}
variable "db_username" {
  type = string
}
variable "api_hostname" {
  type = string
}
variable "github_actions_ci_role" {
  type = string
}

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
variable "github_username" {
  type    = string
  default = "parth9218"
}
variable "github_repo" {
  type    = string
  default = "Document-Intelligence-Platform"
}
variable "api_hostname" {
  type    = string
  default = "api.docintel.com"
}

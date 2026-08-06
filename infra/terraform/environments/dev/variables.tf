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

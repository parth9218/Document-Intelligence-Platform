terraform {
  backend "s3" {
    bucket       = "tf-state-doc-intel-prod-389642461016-us-east-1-an"
    key          = "aws/prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
  # backend "local" {
  #   path          = "./terraform.tfstate"
  #   workspace_dir = "./"
  # }
}

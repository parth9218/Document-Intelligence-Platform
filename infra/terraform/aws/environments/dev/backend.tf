terraform {
  backend "s3" {
    bucket       = "tf-state-doc-intel-dev-793140949744-us-east-1-an"
    key          = "aws/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
  # backend "local" {
  #   path          = "./terraform.tfstate"
  #   workspace_dir = "./"
  # }
}

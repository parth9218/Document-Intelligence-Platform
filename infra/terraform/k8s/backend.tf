terraform {
  backend "s3" {
    # These are dummy values to satisfy 'terraform validate'. They are overridden by -backend-config in the CI/CD pipeline.
    bucket       = "tf-state-doc-intel-dev-389642461016-us-east-1-an"
    key          = "k8s/dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
  # backend "local" {
  #   path          = "./terraform.tfstate"
  #   workspace_dir = "./"
  # }
}

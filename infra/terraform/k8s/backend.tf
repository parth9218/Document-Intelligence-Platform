terraform {
  backend "s3" {
    # These are dummy values to satisfy 'terraform validate'. They are overridden by -backend-config in the CI/CD pipeline.
    bucket       = ""
    key          = ""
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
  # backend "local" {
  #   path          = "./terraform.tfstate"
  #   workspace_dir = "./"
  # }
}

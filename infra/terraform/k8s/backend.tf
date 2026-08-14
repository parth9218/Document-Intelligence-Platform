terraform {
  backend "s3" {
    # Bucket and key are provided via -backend-config in the CI/CD pipeline
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
  # backend "local" {
  #   path          = "./terraform.tfstate"
  #   workspace_dir = "./"
  # }
}

data "terraform_remote_state" "infra" {
  backend = "s3"

  config = {
    bucket = var.bucket
    key    = var.key
    region = var.region
  }
}

output "outputs" {
  value = data.terraform_remote_state.infra.outputs
}

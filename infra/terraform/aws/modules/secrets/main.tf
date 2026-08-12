locals {
  secrets_name = "/${var.project_name}/${var.environment}/secrets"
}

resource "aws_ssm_parameter" "secrets" {
  name = local.secrets_name
  type = "SecureString"
  value = jsonencode({
    session_secret     = ""
    llm_api_key        = ""
    embeddings_api_key = ""
  })
  tags = {
    Name = local.secrets_name
  }
}

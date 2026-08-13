locals {
  ssm_secrets_name = "/${var.project_name}/${var.environment}/secrets"
  ssm_parameters   = "/${var.project_name}/${var.environment}/parameters"
}

resource "aws_ssm_parameter" "secrets" {
  name = local.ssm_secrets_name
  type = "SecureString"
  value = jsonencode({
    SESSION_SECRET    = ""
    LLM_API_KEY       = ""
    EMBEDDING_API_KEY = ""
  })
  tags = {
    Name = local.ssm_secrets_name
  }
}
resource "aws_ssm_parameter" "parameters" {
  name = local.ssm_parameters
  type = "String"
  value = jsonencode({
    DB_HOST             = ""
    DB_PORT             = ""
    DB_NAME             = ""
    DB_USER             = ""
    DB_SSL              = ""
    S3_BUCKET           = ""
    CORS_ALLOWED_ORIGIN = ""

    EMBEDDING_PROVIDER = ""
    EMBEDDING_MODEL    = ""
    EMBEDDING_ENDPOINT = ""

    LLM_PROVIDER   = ""
    LLM_MODEL      = ""
    LLM_ENDPOINT   = ""
    LLM_MAX_TOKENS = ""

    QUEUE_URL = ""
    DLQ_URL   = ""
  })
  tags = {
    Name = local.ssm_parameters
  }
}

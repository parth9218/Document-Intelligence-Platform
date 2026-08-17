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
    DB_IAM_AUTH_ENABLED = "true"
    DB_HOST             = var.db_host
    DB_PORT             = tostring(var.db_port)
    DB_NAME             = var.db_name
    DB_USER             = var.db_username
    DB_SSL              = "true"
    S3_BUCKET           = var.s3_bucket
    CORS_ALLOWED_ORIGIN = var.cloudfront_domain

    EMBEDDING_PROVIDER = ""
    EMBEDDING_MODEL    = ""
    EMBEDDING_ENDPOINT = ""

    LLM_PROVIDER   = ""
    LLM_MODEL      = ""
    LLM_ENDPOINT   = ""
    LLM_MAX_TOKENS = ""

    QUEUE_URL = var.sqs_url
    DLQ_URL   = var.dlq_url
  })
  tags = {
    Name = local.ssm_parameters
  }
}

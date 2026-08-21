locals {
  s3_bucket_frontend  = "${var.project_name}-${var.environment}-frontend-${var.account_id}-${var.region}-an"
  s3_bucket_documents = "${var.project_name}-${var.environment}-documents-${var.account_id}-${var.region}-an"
  rds_subnet_group    = "${var.project_name}-${var.environment}-db-subnets"
  db_sg_group         = "${var.project_name}-${var.environment}-db-sg"
  rds_name            = "${var.project_name}-${var.environment}-db"
}

resource "aws_s3_bucket" "frontend" {
  bucket           = local.s3_bucket_frontend
  force_destroy    = true
  bucket_namespace = "account-regional"

  tags = {
    Name = local.s3_bucket_frontend
  }
}

# ---------------------------------------------------------------------------
# OAC — Frontend S3
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.project_name}-${var.environment}-oac"
  description                       = "OAC for frontend S3"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# API ALB — Origin Verify Secret
#
# CloudFront OAC does not support ALB origins (only s3/mediastore/lambda).
# The standard secure equivalent is a shared secret forwarded as a custom
# request header (X-Origin-Verify). The ALB listener rule should reject any
# request that does not carry this exact header value, preventing direct
# access to the ALB DNS name.
# ---------------------------------------------------------------------------
resource "random_uuid" "cf_origin_verify_token" {}

# ---------------------------------------------------------------------------
# CloudFront Distribution — frontend (S3) + API (ALB)
#
# A single distribution serves both origins:
#   • default behavior  → S3 frontend bucket (OAC-signed)
#   • /api/* behavior   → API ALB (custom header secret, /api prefix stripped)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "/"

  # ── Origin 1: frontend S3 bucket ──────────────────────────────────────────
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
    origin_id                = aws_s3_bucket.frontend.id
  }

  # ── Origin 2: API ALB ─────────────────────────────────────────────────────
  # No OAC — ALB is not a supported OAC origin type. Security is enforced via
  # the X-Origin-Verify header that the ALB listener rule must validate.
  origin {
    domain_name = var.api_alb_dns_name
    origin_id   = "api-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # Secret injected on every request to the ALB. The ALB listener rule must
    # return 403 for requests missing this header to block direct-bypass access.
    custom_header {
      name  = "X-Origin-Verify"
      value = random_uuid.cf_origin_verify_token.result
    }
  }

  # ── Ordered behavior: /api/* → ALB ────────────────────────────────────────
  # Evaluated before the default behavior. Strips /api prefix via CF Function.
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api-alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]

    forwarded_values {
      query_string = true
      headers = [
        "Authorization",
        "Origin",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
      ]
      cookies { forward = "all" }
    }

    # Fully pass-through — API responses must never be cached at the edge
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0

    compress = true
  }

  # ── Default behavior: /* → S3 frontend ────────────────────────────────────
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = aws_s3_bucket.frontend.id

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    viewer_protocol_policy = "redirect-to-https"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate { cloudfront_default_certificate = true }
}

data "aws_iam_policy_document" "origin_bucket_policy" {
  statement {
    sid    = "AllowCloudFrontServicePrincipalReadWrite"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions = ["s3:GetObject"]

    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }

  statement {
    sid    = "AllowGithubActionsCIRoleWriteObjects"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [var.github_actions_ci_role]
    }
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      "${aws_s3_bucket.frontend.arn}",
      "${aws_s3_bucket.frontend.arn}/*"
    ]
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.origin_bucket_policy.json
}


resource "aws_s3_bucket" "documents" {
  bucket           = local.s3_bucket_documents
  bucket_namespace = "account-regional"
  force_destroy    = var.environment == "dev"
  tags = {
    Name = local.s3_bucket_documents
  }
}

resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST", "GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}


resource "aws_db_subnet_group" "db" {
  name        = local.rds_subnet_group
  description = "Subnet Group for Postgres RDS"
  subnet_ids  = [for idx, subnet in var.private_subnets : subnet.id]

  tags = {
    Name = local.rds_subnet_group
  }
}

resource "aws_security_group" "db" {
  name   = local.db_sg_group
  vpc_id = var.vpc_id
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [for idx, subnet in var.private_subnets : subnet.cidr]
    self        = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = local.db_sg_group
  }
}

resource "aws_db_instance" "db" {
  identifier                          = local.rds_name
  engine                              = "postgres"
  engine_version                      = "18" # pgvector supported
  instance_class                      = "db.t3.micro"
  allocated_storage                   = 20
  db_name                             = var.db_name
  username                            = var.db_user_name
  manage_master_user_password         = true
  db_subnet_group_name                = aws_db_subnet_group.db.name
  vpc_security_group_ids              = [aws_security_group.db.id]
  iam_database_authentication_enabled = true
  skip_final_snapshot                 = var.environment != "prod"
  deletion_protection                 = var.environment == "prod"

  tags = {
    Name = local.rds_name
  }
}

# resource "aws_iam_role" "rds_proxy" {
#   count = var.environment == "prod" ? 1 : 0
#   name  = "${var.project_name}-${var.environment}-rds-proxy-role"
#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [{
#       Action    = "sts:AssumeRole"
#       Effect    = "Allow"
#       Principal = { Service = "rds.amazonaws.com" }
#     }]
#   })
# }

# resource "aws_iam_role_policy" "rds_proxy" {
#   count = var.environment == "prod" ? 1 : 0
#   name  = "SecretsManagerAccess"
#   role  = aws_iam_role.rds_proxy[0].id
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [{
#       Action   = ["secretsmanager:GetSecretValue"]
#       Effect   = "Allow"
#       Resource = aws_secretsmanager_secret.db_credentials.arn
#     }]
#   })
# }

# resource "aws_db_proxy" "db" {
#   count                  = var.environment == "prod" ? 1 : 0
#   name                   = "${var.project_name}-${var.environment}-proxy"
#   debug_logging          = false
#   engine_family          = "POSTGRESQL"
#   idle_client_timeout    = 1800
#   require_tls            = true
#   role_arn               = aws_iam_role.rds_proxy[0].arn
#   vpc_security_group_ids = [aws_security_group.db.id]
#   vpc_subnet_ids         = var.private_subnet_ids

#   auth {
#     auth_scheme = "SECRETS"
#     iam_auth    = "DISABLED"
#     secret_arn  = aws_secretsmanager_secret.db_credentials.arn
#   }
# }

# resource "aws_db_proxy_default_target_group" "db" {
#   count         = var.environment == "prod" ? 1 : 0
#   db_proxy_name = aws_db_proxy.db[0].name
# }

# resource "aws_db_proxy_target" "db" {
#   count                  = var.environment == "prod" ? 1 : 0
#   db_instance_identifier = aws_db_instance.db.identifier
#   db_proxy_name          = aws_db_proxy.db[0].name
#   target_group_name      = aws_db_proxy_default_target_group.db[0].name
# }

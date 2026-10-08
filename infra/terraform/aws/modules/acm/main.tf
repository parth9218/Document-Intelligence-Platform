resource "aws_acm_certificate" "acm_cert" {
  private_key      = tls_private_key.cert_private_key.private_key_pem
  certificate_body = tls_self_signed_cert.self_signed_cert.cert_pem

  tags = {
    Name = "${var.project_name}-${var.environment}-acm-cert"
  }
}

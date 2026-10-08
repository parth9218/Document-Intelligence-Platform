resource "tls_private_key" "cert_private_key" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_self_signed_cert" "self_signed_cert" {
  private_key_pem = tls_private_key.cert_private_key.private_key_pem

  subject {
    common_name = var.api_hostname
  }


  validity_period_hours = 8760 # 1 year validity

  allowed_uses = [
    "key_encipherment",
    "digital_signature",
    "server_auth",
  ]
}

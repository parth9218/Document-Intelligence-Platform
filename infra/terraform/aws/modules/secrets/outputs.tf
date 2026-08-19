output "ssm_parameter_name" {
  value = aws_ssm_parameter.parameters.name
}
output "ssm_secrets_name" {
  value = aws_ssm_parameter.secrets.name
}

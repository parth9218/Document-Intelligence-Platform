output "documents_bucket_id" { value = aws_s3_bucket.documents.id }
output "documents_bucket_arn" { value = aws_s3_bucket.documents.arn }
output "db_address" { value = aws_db_instance.db.address }
output "db_password_secret" { value = aws_db_instance.db.master_user_secret[0].secret_arn }
output "db_arn" { value = aws_db_instance.db.arn }
output "db_port" {
  value = aws_db_instance.db.port
}

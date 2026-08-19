output "sqs_queue_arn" { value = aws_sqs_queue.documents.arn }
output "sqs_queue_url" { value = aws_sqs_queue.documents.id }
output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}
output "dlq_url" {
  value = aws_sqs_queue.dlq.id
}

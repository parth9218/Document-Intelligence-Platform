locals {
  documents_queue = "${var.project_name}-${var.environment}-documents-queue"
  documents_dlq   = "${var.project_name}-${var.environment}-documents-dlq"
}

resource "aws_sqs_queue" "dlq" {
  name = local.documents_dlq

  tags = {
    Name = local.documents_dlq
  }
}

resource "aws_sqs_queue" "documents" {
  name = local.documents_queue
  tags = {
    Name = local.documents_queue
  }
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue_policy" "documents" {
  queue_url = aws_sqs_queue.documents.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.documents.arn
        Condition = {
          ArnEquals = { "aws:SourceArn" = var.documents_bucket_arn }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_notification" "documents" {
  bucket = var.documents_bucket_id
  queue {
    queue_arn     = aws_sqs_queue.documents.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "/"
  }
  depends_on = [aws_sqs_queue_policy.documents]
}

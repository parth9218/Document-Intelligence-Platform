#!/bin/bash

# Enable bash error logging and exit on error
set -eo pipefail

echo "=========================================================="
echo "🚀 Initializing LocalStack AWS Resources..."
echo "=========================================================="

# 1. Create S3 Bucket and Set CORS
if [ -n "$S3_BUCKET_NAME" ]; then
  echo "📥 Creating S3 Bucket: $S3_BUCKET_NAME..."
  awslocal s3 mb "s3://$S3_BUCKET_NAME"

  echo "⚙️ Configuring S3 CORS policy for $S3_BUCKET_NAME..."
  awslocal s3api put-bucket-cors --bucket "$S3_BUCKET_NAME" --cors-configuration '{
    "CORSRules": [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"]
      }
    ]
  }'
else
  echo "⚠️ S3_BUCKET_NAME is not set, skipping bucket creation."
fi

# 2. Create SQS Dead Letter Queue (DLQ)
if [ -n "$DLQ_NAME" ]; then
  echo "📥 Creating SQS Dead Letter Queue: $DLQ_NAME..."
  awslocal sqs create-queue --queue-name "$DLQ_NAME"
else
  echo "⚠️ DLQ_NAME is not set, skipping DLQ creation."
fi

# 3. Create SQS Main Queue with Redrive Policy
if [ -n "$QUEUE_NAME" ] && [ -n "$DLQ_NAME" ]; then
  echo "📥 Creating SQS Main Queue: $QUEUE_NAME with Redrive Policy..."
  
  # Format the Redrive Policy pointing to the DLQ ARN
  REDRIVE_POLICY="{\"deadLetterTargetArn\":\"arn:aws:sqs:${AWS_DEFAULT_REGION:-us-east-1}:000000000000:$DLQ_NAME\",\"maxReceiveCount\":3}"
  
  awslocal sqs create-queue --queue-name "$QUEUE_NAME" --attributes "{
    \"VisibilityTimeout\": \"600\",
    \"RedrivePolicy\": \"$(echo $REDRIVE_POLICY | sed 's/"/\\"/g')\"
  }"
else
  echo "⚠️ QUEUE_NAME or DLQ_NAME is not set, skipping main queue creation."
fi

# 4. Configure S3 Event Notification to SQS
if [ -n "$S3_BUCKET_NAME" ] && [ -n "$QUEUE_NAME" ]; then
  echo "⚙️ Configuring S3 Event Notifications to trigger SQS main queue..."
  awslocal s3api put-bucket-notification-configuration --bucket "$S3_BUCKET_NAME" --notification-configuration '{
    "QueueConfigurations": [
      {
        "QueueArn": "arn:aws:sqs:'"${AWS_DEFAULT_REGION:-us-east-1}"':000000000000:'"$QUEUE_NAME"'",
        "Events": ["s3:ObjectCreated:*"]
      }
    ]
  }'
else
  echo "⚠️ S3_BUCKET_NAME or QUEUE_NAME is not set, skipping notification configuration."
fi

echo "=========================================================="
echo "🎯 LocalStack AWS resource initialization complete!"
echo "=========================================================="

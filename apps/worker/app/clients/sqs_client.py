from typing import Dict, List, Optional
import boto3
from app.config.settings import settings

class SqsClient:
    def __init__(self):
        sqs_args = {
            "service_name": "sqs",
            "region_name": settings.AWS_REGION,
        }
        # Inject LocalStack endpoint parameters if present
        if settings.LOCALSTACK_URL:
            sqs_args["endpoint_url"] = settings.LOCALSTACK_URL
            sqs_args["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            sqs_args["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        self.client = boto3.client(**sqs_args)

    def check_queue_exists(self, queue_url: str) -> bool:
        """Check if the given queue URL is accessible and exists."""
        try:
            self.client.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
            return True
        except Exception:
            return False

    def receive_messages(
        self, 
        queue_url: str, 
        max_messages: int = 1, 
        wait_time: int = 20,
        visibility_timeout: int = 600
    ) -> list:
        """Fetch messages from the SQS queue using long polling."""
        response = self.client.receive_message(
            QueueUrl=queue_url,
            AttributeNames=["All"],
            MessageAttributeNames=["All"],
            MaxNumberOfMessages=max_messages,
            WaitTimeSeconds=wait_time,
            VisibilityTimeout=visibility_timeout
        )
        return response.get("Messages", [])

    def delete_message(self, queue_url: str, receipt_handle: str) -> None:
        """Remove a message from the queue after successful processing."""
        self.client.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)

    def send_message(self, queue_url: str, body: str) -> dict:
        """Send a message to the target SQS queue."""
        return self.client.send_message(QueueUrl=queue_url, MessageBody=body)

import json
from typing import Callable
from app.clients.sqs_client import SqsClient
from app.handlers.job_handler import JobHandler
from app.errors import PermanentFailure, TransientFailure
from app.utils.logger import logger

class SqsConsumer:
    def __init__(self, sqs_client: SqsClient, job_handler: JobHandler):
        self.client = sqs_client
        self.handler = job_handler

    def process_single_message(self, message: dict, queue_url: str) -> None:
        """Parse message body, validate schema, and dispatch to JobHandler."""
        receipt_handle = message["ReceiptHandle"]
        
        try:
            body = json.loads(message["Body"])
            records = body.get("Records", [])
            if not records:
                logger.warning("Received SQS message with empty Records. Deleting message.")
                self.client.delete_message(queue_url, receipt_handle)
                return

            s3_record = records[0].get("s3", {})
            bucket_name = s3_record.get("bucket", {}).get("name")
            object_key = s3_record.get("object", {}).get("key")

            if not bucket_name or not object_key:
                logger.warning("SQS message S3 record is missing bucket or key parameters. Deleting message.")
                self.client.delete_message(queue_url, receipt_handle)
                return

            # Expected key format: sessions/{sessionId}/documents/{documentId}/original
            parts = object_key.split("/")
            if len(parts) < 4 or parts[0] != "sessions" or parts[2] != "documents":
                logger.warning(
                    f"S3 object key does not match standard naming convention: {object_key}. Deleting message."
                )
                self.client.delete_message(queue_url, receipt_handle)
                return

            session_id = parts[1]
            document_id = parts[3]

            logger.info(
                f"[Consumer] Successfully parsed message", 
                extra={"document_id": document_id, "session_id": session_id}
            )

            # Delegate to handler
            try:
                self.handler.process_job(document_id, session_id, object_key, bucket_name)
                # Success -> Delete from SQS
                self.client.delete_message(queue_url, receipt_handle)
            except PermanentFailure as pf:
                # Permanent failure is handled by marking in DB and deleting from SQS (already logged)
                self.client.delete_message(queue_url, receipt_handle)
            except TransientFailure:
                # Let SQS visibility timeout expire to retry automatically
                logger.warning(
                    f"[Consumer] Transient failure encountered. Letting visibility timeout handle retry.",
                    extra={"document_id": document_id}
                )

        except json.JSONDecodeError as je:
            logger.error(f"[Consumer] SQS Message body is not valid JSON: {je}. Deleting message.")
            self.client.delete_message(queue_url, receipt_handle)
        except Exception as e:
            logger.error(f"[Consumer] Unhandled exception processing message: {e}")

    def start_consuming(self, queue_url: str, should_shutdown: Callable[[], bool]) -> None:
        """Poll the SQS main queue continuously until shutdown is requested."""
        logger.info(f"[Consumer] Starting SQS poller loop on: {queue_url}")
        
        while not should_shutdown():
            try:
                messages = self.client.receive_messages(
                    queue_url=queue_url,
                    max_messages=1,
                    wait_time=20,
                    visibility_timeout=600
                )
                
                if messages:
                    self.process_single_message(messages[0], queue_url)
                    
            except Exception as e:
                if not should_shutdown():
                    logger.error(f"[Consumer] Error in polling cycle: {e}")
                    # Brief cooling sleep to prevent aggressive loops on persistent SQS connection errors
                    import time
                    time.sleep(2)
                    
        logger.info("[Consumer] Consumer polling loop stopped.")

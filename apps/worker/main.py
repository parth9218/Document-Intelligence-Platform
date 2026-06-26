import os
import sys
import time
import json
import uuid
import signal
import logging
import threading
from typing import List

# Setup sys.path to resolve 'app' correctly from project root
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.config.settings import settings
from app.utils.logger import setup_logging, logger
from app.clients.sqs_client import SqsClient
from app.handlers.job_handler import JobHandler
from app.consumers.sqs_consumer import SqsConsumer

# Generate a unique worker ID
WORKER_ID = f"worker-pod-{uuid.uuid4().hex[:8]}"

# Global shutdown flag
shutdown_requested = False

def handle_shutdown(signum, frame) -> None:
    """Register signal intercepts and trigger graceful shutdown process."""
    global shutdown_requested
    logger.info(f"Shutdown signal received ({signum}). Initiating graceful termination...")
    shutdown_requested = True

def should_shutdown() -> bool:
    """Helper function passed to loops to verify shutdown request status."""
    return shutdown_requested

def run_dlq_poller(sqs_client: SqsClient, handler: JobHandler, dlq_url: str) -> None:
    """Secondary thread poller loop that queries the DLQ and registers failures in the DB."""
    logger.info(f"[DLQ Poller] Listening on DLQ: {settings.DLQ_URL}")
    
    while not shutdown_requested:
        try:
            # Poll DLQ with shorter wait time
            messages = sqs_client.receive_messages(
                queue_url=dlq_url,
                max_messages=10,
                wait_time=10
            )

            for msg in messages:
                logger.warning(f"[DLQ Poller] Dead letter message received: {msg['MessageId']}")
                
                try:
                    body = json.loads(msg["Body"])
                    records = body.get("Records", [])
                    if records:
                        s3_record = records[0].get("s3", {})
                        object_key = s3_record.get("object", {}).get("key")
                        if object_key:
                            parts = object_key.split("/")
                            if len(parts) >= 4:
                                document_id = parts[3]
                                handler.handle_dlq_job(document_id)
                                logger.info(f"[DLQ Poller] Marked document failed in DB: {document_id}")
                except Exception as parse_err:
                    logger.error(f"[DLQ Poller] Error parsing DLQ message: {parse_err}")
                finally:
                    # Always delete dead message from DLQ to prevent infinite loops
                    sqs_client.delete_message(dlq_url, msg["ReceiptHandle"])

        except Exception as e:
            logger.error(f"[DLQ Poller] Error in DLQ polling loop: {e}")

        # Sleep cooperatively respecting shutdown
        for _ in range(30):
            if shutdown_requested:
                break
            time.sleep(1)

    logger.info("[DLQ Poller] DLQ poller thread stopping.")

def main() -> None:
    # 1. Initialize structured logging
    setup_logging()
    
    logger.info(f"Starting background worker daemon. Worker ID: {WORKER_ID}")

    # 2. Register signal handlers
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # 3. Instantiate SQS client and verify Queue URLs with retries
    sqs_client = SqsClient()
    queue_url = settings.QUEUE_URL
    dlq_url = settings.DLQ_URL
    connected = False

    for attempt in range(10):
        if sqs_client.check_queue_exists(queue_url) and sqs_client.check_queue_exists(dlq_url):
            logger.info("Successfully connected to AWS SQS queues.")
            connected = True
            break
        else:
            logger.warning(
                f"Attempt {attempt+1}/10: AWS SQS queues at {queue_url} or {dlq_url} not accessible yet. Retrying in 3s..."
            )
            time.sleep(3)

    if not connected:
        logger.critical("Fatal: AWS SQS queues could not be accessed. Exiting.")
        sys.exit(1)

    # 4. Instantiate architecture layers
    job_handler = JobHandler(worker_id=WORKER_ID)
    sqs_consumer = SqsConsumer(sqs_client=sqs_client, job_handler=job_handler)

    # 5. Start secondary thread for DLQ polling
    dlq_thread = threading.Thread(
        target=run_dlq_poller, 
        args=(sqs_client, job_handler, dlq_url), 
        daemon=True
    )
    dlq_thread.start()

    # 6. Enter primary polling consumer loop (blocking main thread)
    sqs_consumer.start_consuming(queue_url=queue_url, should_shutdown=should_shutdown)

    # 7. Graceful exit cleanup
    logger.info("Main thread cleaning up background assets...")
    dlq_thread.join(timeout=5)
    logger.info("Background worker daemon stopped. Exiting.")

if __name__ == "__main__":
    main()

import unittest
from unittest.mock import patch, MagicMock
import json
import datetime
import os
import sys

# Ensure app is resolvable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.clients.sqs_client import SqsClient
from app.consumers.sqs_consumer import SqsConsumer
from app.handlers.job_handler import JobHandler
from app.errors import PermanentFailure, TransientFailure
from app.repositories.job_repository import JobRepository
from app.models import Document, ProcessingJob
from app.services.document_service import DocumentService
import main

class TestSqsClient(unittest.TestCase):
    @patch('app.clients.sqs_client.boto3')
    def test_client_init_localstack(self, mock_boto3):
        # Verify sqs client initializes with localstack if URL provided
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        
        client = SqsClient()
        self.assertEqual(client.client, mock_client)
        mock_boto3.client.assert_called_once()
        
    @patch('app.clients.sqs_client.boto3')
    def test_check_queue_exists(self, mock_boto3):
        mock_client = MagicMock()
        mock_client.get_queue_attributes.return_value = {"Attributes": {"QueueArn": "arn:aws:sqs:..."}}
        mock_boto3.client.return_value = mock_client
        
        client = SqsClient()
        exists = client.check_queue_exists("http://mock-queue-url")
        self.assertTrue(exists)
        mock_client.get_queue_attributes.assert_called_with(
            QueueUrl="http://mock-queue-url", AttributeNames=["QueueArn"]
        )

    @patch('app.clients.sqs_client.boto3')
    def test_check_queue_exists_fails(self, mock_boto3):
        mock_client = MagicMock()
        mock_client.get_queue_attributes.side_effect = Exception("Not found")
        mock_boto3.client.return_value = mock_client
        
        client = SqsClient()
        exists = client.check_queue_exists("http://mock-queue-url")
        self.assertFalse(exists)

    @patch('app.clients.sqs_client.boto3')
    def test_receive_messages(self, mock_boto3):
        mock_client = MagicMock()
        mock_client.receive_message.return_value = {"Messages": [{"MessageId": "123"}]}
        mock_boto3.client.return_value = mock_client
        
        client = SqsClient()
        msgs = client.receive_messages("http://mock-queue-url")
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0]["MessageId"], "123")

    @patch('app.clients.sqs_client.boto3')
    def test_delete_message(self, mock_boto3):
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        
        client = SqsClient()
        client.delete_message("http://mock-queue-url", "receipt-handle")
        mock_client.delete_message.assert_called_with(
            QueueUrl="http://mock-queue-url", ReceiptHandle="receipt-handle"
        )


class TestSqsConsumer(unittest.TestCase):
    def setUp(self):
        self.mock_client = MagicMock()
        self.mock_handler = MagicMock()
        self.consumer = SqsConsumer(sqs_client=self.mock_client, job_handler=self.mock_handler)
        self.queue_url = "http://mock-queue-url"
        self.mock_message = {
            "ReceiptHandle": "receipt-123",
            "Body": json.dumps({
                "Records": [{
                    "s3": {
                        "bucket": {"name": "documents-bucket"},
                        "object": {"key": "sessions/sess-123/documents/doc-456/original"}
                    }
                }]
            })
        }

    def test_process_single_message_success(self):
        self.consumer.process_single_message(self.mock_message, self.queue_url)
        self.mock_handler.process_job.assert_called_once_with(
            "doc-456", "sess-123"
        )
        self.mock_client.delete_message.assert_called_once_with(self.queue_url, "receipt-123")

    def test_process_single_message_empty_records(self):
        msg = {
            "ReceiptHandle": "receipt-123",
            "Body": json.dumps({"Records": []})
        }
        self.consumer.process_single_message(msg, self.queue_url)
        self.mock_client.delete_message.assert_called_once_with(self.queue_url, "receipt-123")
        self.mock_handler.process_job.assert_not_called()

    def test_process_single_message_missing_s3_details(self):
        msg = {
            "ReceiptHandle": "receipt-123",
            "Body": json.dumps({
                "Records": [{"s3": {}}]
            })
        }
        self.consumer.process_single_message(msg, self.queue_url)
        self.mock_client.delete_message.assert_called_once_with(self.queue_url, "receipt-123")
        self.mock_handler.process_job.assert_not_called()

    def test_process_single_message_invalid_key_format(self):
        msg = {
            "ReceiptHandle": "receipt-123",
            "Body": json.dumps({
                "Records": [{
                    "s3": {
                        "bucket": {"name": "documents-bucket"},
                        "object": {"key": "invalid/format/here"}
                    }
                }]
            })
        }
        self.consumer.process_single_message(msg, self.queue_url)
        self.mock_client.delete_message.assert_called_once_with(self.queue_url, "receipt-123")
        self.mock_handler.process_job.assert_not_called()

    def test_process_single_message_json_decode_error(self):
        msg = {
            "ReceiptHandle": "receipt-123",
            "Body": "invalid-json"
        }
        self.consumer.process_single_message(msg, self.queue_url)
        self.mock_client.delete_message.assert_called_once_with(self.queue_url, "receipt-123")
        self.mock_handler.process_job.assert_not_called()

    def test_process_single_message_permanent_failure(self):
        self.mock_handler.process_job.side_effect = PermanentFailure("code", "msg")
        self.consumer.process_single_message(self.mock_message, self.queue_url)
        self.mock_client.delete_message.assert_called_once_with(self.queue_url, "receipt-123")

    def test_process_single_message_transient_failure(self):
        self.mock_handler.process_job.side_effect = TransientFailure("network issues")
        self.consumer.process_single_message(self.mock_message, self.queue_url)
        self.mock_client.delete_message.assert_not_called()

    def test_start_consuming_loop(self):
        self.mock_client.receive_messages.return_value = [self.mock_message]
        
        # Stop poller loop after one cycle
        shutdown_states = [False, True]
        def should_shutdown():
            return shutdown_states.pop(0)

        self.consumer.start_consuming(self.queue_url, should_shutdown)
        self.mock_client.receive_messages.assert_called_once_with(
            queue_url=self.queue_url, max_messages=1, wait_time=20, visibility_timeout=600
        )
        self.mock_handler.process_job.assert_called_once()


class TestJobHandler(unittest.TestCase):
    def setUp(self):
        self.worker_id = "test-worker"
        self.handler = JobHandler(self.worker_id)
        self.doc_id = "00000000-0000-0000-0000-000000000001"
        self.sess_id = "00000000-0000-0000-0000-000000000002"
        self.s3_key = "sessions/sess-123/documents/doc-456/original"

    @patch('app.handlers.job_handler.get_db')
    @patch('app.services.document_service.ExtractorService')
    @patch('app.services.document_service.get_storage_provider')
    def test_process_job_success(self, mock_get_storage, mock_extractor_class, mock_get_db):
        mock_storage = MagicMock()
        mock_storage.download_file.return_value = "/tmp/mock-path"
        mock_get_storage.return_value = mock_storage

        mock_extractor = MagicMock()
        mock_extractor.extract_text.return_value = [(1, "page 1 text")]
        mock_extractor_class.return_value = mock_extractor

        mock_db = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_db
        
        # Mock job retrieval
        mock_job = ProcessingJob(
            id=self.doc_id,
            document_id=self.doc_id,
            session_id=self.sess_id,
            status="pending_upload"
        )
        mock_doc = Document(
            id=self.doc_id,
            session_id=self.sess_id,
            filename="test.pdf",
            mime_type="application/pdf",
            file_size_bytes=100,
            s3_key=self.s3_key,
            status="pending_upload"
        )
        
        # We need mock_db.query().filter().first() to return mock_job and mock_doc
        def mock_query(model):
            query_mock = MagicMock()
            if model == ProcessingJob:
                query_mock.filter.return_value.first.return_value = mock_job
            elif model == Document:
                query_mock.filter.return_value.first.return_value = mock_doc
            return query_mock

        mock_db.query.side_effect = mock_query

        self.handler.process_job(self.doc_id, self.sess_id)

        # Assert job state transitions ended at completed
        self.assertEqual(mock_job.status, "completed")
        self.assertEqual(mock_job.progress_pct, 100)
        self.assertEqual(mock_doc.status, "completed")
        self.assertIsNotNone(mock_job.started_at)
        self.assertIsNotNone(mock_job.completed_at)

    @patch('app.handlers.job_handler.get_db')
    def test_process_job_not_found(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_db
        mock_db.query.return_value.filter.return_value.first.return_value = None

        with self.assertRaises(PermanentFailure):
            self.handler.process_job(self.doc_id, self.sess_id)

    @patch('app.handlers.job_handler.get_db')
    def test_process_job_completed_skipped(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_db
        
        mock_job = ProcessingJob(
            id=self.doc_id,
            document_id=self.doc_id,
            session_id=self.sess_id,
            status="completed"
        )
        mock_db.query.return_value.filter.return_value.first.return_value = mock_job

        with patch('app.handlers.job_handler.JobRepository.update_job_status') as mock_update:
            self.handler.process_job(self.doc_id, self.sess_id)
            mock_update.assert_not_called()

    @patch('app.handlers.job_handler.get_db')
    def test_handle_dlq_job(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value.__enter__.return_value = mock_db
        
        mock_job = ProcessingJob(
            id=self.doc_id,
            document_id=self.doc_id,
            session_id=self.sess_id,
            status="processing"
        )
        mock_doc = Document(
            id=self.doc_id,
            session_id=self.sess_id,
            s3_key=self.s3_key,
            status="processing"
        )
        
        def mock_query(model):
            query_mock = MagicMock()
            if model == ProcessingJob:
                query_mock.filter.return_value.first.return_value = mock_job
            elif model == Document:
                query_mock.filter.return_value.first.return_value = mock_doc
            return query_mock

        mock_db.query.side_effect = mock_query

        self.handler.handle_dlq_job(self.doc_id)
        
        self.assertEqual(mock_job.status, "failed")
        self.assertEqual(mock_job.error_code, "max_retries_exceeded")
        self.assertEqual(mock_doc.status, "failed")


class TestMainBootstrap(unittest.TestCase):
    def test_shutdown_signal_handler(self):
        # Verify signal handler updates shutdown_requested
        self.assertFalse(main.shutdown_requested)
        main.handle_shutdown(15, None)
        self.assertTrue(main.shutdown_requested)
        self.assertTrue(main.should_shutdown())
        
        # Reset shutdown status for other test runs
        main.shutdown_requested = False

if __name__ == "__main__":
    unittest.main()

import unittest
import os
import uuid
import time
import socket
import tempfile
import boto3
import fitz
import datetime
from unittest.mock import patch, MagicMock

from app.config.settings import settings
from app.models.db import get_db
from app.models import Document, ProcessingJob
from app.models.generated_models import Sessions
from app.repositories.job_repository import JobRepository
from app.services.extractor import ExtractorService
from app.services.document_service import DocumentService
from app.services.storage_service import S3StorageProvider
from app.handlers.job_handler import JobHandler
from app.consumers.sqs_consumer import SqsConsumer
from app.clients.sqs_client import SqsClient
from app.errors import PermanentFailure

@unittest.skipIf(not settings.LOCALSTACK_URL, "LocalStack not configured / running")
class TestIntegrationTask201(unittest.TestCase):
    def setUp(self):
        # Setup clients
        self.sqs_client = SqsClient()
        self.s3_client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            endpoint_url=settings.LOCALSTACK_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY
        )
        
        self.worker_id = os.environ.get("HOSTNAME") or f"test-worker-pod-{uuid.uuid4().hex[:8]}"
        self.job_handler = JobHandler(worker_id=self.worker_id)
        self.consumer = SqsConsumer(sqs_client=self.sqs_client, job_handler=self.job_handler)
        
        # Track resources to clean up
        self.created_sessions = []
        self.created_documents = []
        self.created_jobs = []
        self.uploaded_s3_keys = []
        self.temp_files_to_check = []
        
        # SQS polling cleanup: make sure queue is drained before test
        self._drain_queue()

    def tearDown(self):
        # 1. Clean up S3 objects
        for key in self.uploaded_s3_keys:
            try:
                self.s3_client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
            except Exception as e:
                print(f"Failed to delete S3 key {key}: {e}")
                
        # 2. Clean up DB records in reverse dependency order
        with get_db() as db:
            for job_id in self.created_jobs:
                db.query(ProcessingJob).filter(ProcessingJob.id == job_id).delete()
            for doc_id in self.created_documents:
                db.query(Document).filter(Document.id == doc_id).delete()
            for sess_id in self.created_sessions:
                db.query(Sessions).filter(Sessions.id == sess_id).delete()
            db.commit()

        # 3. Drain SQS to clean up messages
        self._drain_queue()
        
        # 4. Verify no temp files leaked
        for temp_path in self.temp_files_to_check:
            self.assertFalse(
                os.path.exists(temp_path),
                f"Leaked temporary file found at: {temp_path}"
            )

    def _drain_queue(self):
        """Helper to consume and delete all messages from queue to ensure isolation."""
        try:
            messages = self.sqs_client.receive_messages(
                queue_url=settings.QUEUE_URL,
                max_messages=10,
                wait_time=1
            )
            for msg in messages:
                self.sqs_client.delete_message(settings.QUEUE_URL, msg["ReceiptHandle"])
        except Exception:
            pass

    def _create_session_in_db(self, db, session_id: uuid.UUID) -> None:
        session = Sessions(
            id=session_id,
            session_token=f"token-{session_id.hex}",
            expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
        )
        db.add(session)
        db.flush()
        self.created_sessions.append(session_id)

    def _create_document_and_job_in_db(
        self, db, session_id: uuid.UUID, document_id: uuid.UUID, filename: str, mime_type: str, file_size: int, s3_key: str
    ) -> None:
        doc = Document(
            id=document_id,
            session_id=session_id,
            filename=filename,
            mime_type=mime_type,
            file_size_bytes=file_size,
            s3_key=s3_key,
            status="pending_upload"
        )
        db.add(doc)
        db.flush()
        self.created_documents.append(document_id)
        
        job = ProcessingJob(
            id=uuid.uuid4(),
            document_id=document_id,
            session_id=session_id,
            status="pending_upload"
        )
        db.add(job)
        db.flush()
        self.created_jobs.append(job.id)

    def _generate_valid_pdf_bytes(self) -> bytes:
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 50), "Hello World PDF Integration Test Page 1")
        page2 = doc.new_page()
        page2.insert_text((50, 50), "Hello World PDF Integration Test Page 2")
        pdf_bytes = doc.write()
        doc.close()
        return pdf_bytes

    def test_validation_step_1_2_3_9_pdf(self):
        """
        Covers:
        1. Upload a text-native PDF to local S3. Queue an S3 ObjectCreated payload.
        2. Verify worker transitions through downloading -> validating -> extracting in order.
        9. Verify temp file does not persist after worker run.
        """
        # Generate valid PDF
        pdf_bytes = self._generate_valid_pdf_bytes()
        file_size = len(pdf_bytes)
        
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "test.pdf", "application/pdf", file_size, s3_key
            )
            db.commit()

        # Upload to S3 (this triggers localstack to send event to SQS)
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=pdf_bytes,
            ContentType="application/pdf"
        )
        self.uploaded_s3_keys.append(s3_key)

        # Wait up to 5 seconds for SQS notification to propagate in localstack
        msg = None
        for _ in range(10):
            msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=1)
            if msgs:
                msg = msgs[0]
                break
            time.sleep(0.5)
            
        self.assertIsNotNone(msg, "SQS message not received after S3 upload")

        # Intercept extractor methods to:
        # A) Verify DB transitions on the fly (Step 2)
        # B) Track temp file path to ensure it is deleted (Step 9)
        original_download = S3StorageProvider.download_file
        original_validate = ExtractorService.validate_document
        original_extract = ExtractorService.extract_text
        
        temp_paths_recorded = []

        def wrapped_download(inst, remote_path, expected_size, expected_mime):
            path = original_download(inst, remote_path, expected_size, expected_mime)
            temp_paths_recorded.append(path)
            self.temp_files_to_check.append(path)
            # Verify DB is currently in 'downloading' state
            with get_db() as db:
                job = JobRepository.get_job_by_document_id(db, str(document_id))
                self.assertEqual(job.status, "downloading")
                self.assertEqual(job.worker_id, self.worker_id)
                self.assertIsNotNone(job.started_at)
            return path

        def wrapped_validate(inst, temp_path, expected_mime):
            # Verify DB has transitioned to 'validating'
            with get_db() as db:
                job = JobRepository.get_job_by_document_id(db, str(document_id))
                self.assertEqual(job.status, "validating")
            return original_validate(inst, temp_path, expected_mime)

        def wrapped_extract(inst, temp_path, mime_type):
            # Verify DB has transitioned to 'extracting'
            with get_db() as db:
                job = JobRepository.get_job_by_document_id(db, str(document_id))
                self.assertEqual(job.status, "extracting")
            return original_extract(inst, temp_path, mime_type)

        with patch.object(S3StorageProvider, 'download_file', wrapped_download), \
             patch.object(ExtractorService, 'validate_document', wrapped_validate), \
             patch.object(ExtractorService, 'extract_text', wrapped_extract):
            
            # Process single message
            self.consumer.process_single_message(msg, settings.QUEUE_URL)

        # Verify job is completed
        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "completed")
            self.assertEqual(doc.status, "completed")
            self.assertEqual(job.progress_pct, 100)
            self.assertIsNotNone(job.completed_at)

        # Verify temp file was cleaned up (Step 9)
        self.assertEqual(len(temp_paths_recorded), 1)
        self.assertFalse(os.path.exists(temp_paths_recorded[0]))

    def test_validation_step_3_txt(self):
        """
        Covers:
        3. Upload a plain .txt file — verify single-page extraction.
        """
        txt_content = "This is a plain text file for testing extraction."
        txt_bytes = txt_content.encode("utf-8")
        file_size = len(txt_bytes)
        
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "test.txt", "text/plain", file_size, s3_key
            )
            db.commit()

        # Upload plain text
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=txt_bytes,
            ContentType="text/plain"
        )
        self.uploaded_s3_keys.append(s3_key)

        # Retrieve SQS message
        msg = None
        for _ in range(10):
            msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=1)
            if msgs:
                msg = msgs[0]
                break
            time.sleep(0.5)
            
        self.assertIsNotNone(msg, "SQS message not received after txt upload")

        # Process message
        self.consumer.process_single_message(msg, settings.QUEUE_URL)

        # Verify completed status
        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "completed")
            self.assertEqual(doc.status, "completed")

    def test_validation_step_4_file_not_found(self):
        """
        Covers:
        4. Queue an SQS event for a non-existent S3 key — verify error_code = 'file_not_found' and SQS message deleted.
        """
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "nonexistent.pdf", "application/pdf", 1234, s3_key
            )
            db.commit()

        # Manually create SQS message pointing to non-existent key
        sqs_body = {
            "Records": [{
                "s3": {
                    "bucket": {"name": settings.S3_BUCKET_NAME},
                    "object": {"key": s3_key}
                }
            }]
        }
        self.sqs_client.send_message(settings.QUEUE_URL, json_body:=__import__('json').dumps(sqs_body))

        # Retrieve it
        msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=2)
        self.assertEqual(len(msgs), 1)
        msg = msgs[0]

        # Process and verify error transitions
        self.consumer.process_single_message(msg, settings.QUEUE_URL)

        # Verify status set to failed and error_code 'file_not_found'
        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "failed")
            self.assertEqual(doc.status, "failed")
            self.assertEqual(job.error_code, "file_not_found")

        # Verify message deleted (long poll returns nothing)
        remaining = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=1)
        self.assertEqual(len(remaining), 0)

    def test_validation_step_5_size_mismatch(self):
        """
        Covers:
        5. Upload a file where the declared file_size_bytes does not match the actual S3 object size.
        """
        payload = b"some bytes"  # size = 10
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "mismatch.pdf", "application/pdf", 9999, s3_key # Declared size = 9999
            )
            db.commit()

        # Upload to S3
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=payload,
            ContentType="application/pdf"
        )
        self.uploaded_s3_keys.append(s3_key)

        # Retrieve message
        msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=2)
        self.assertEqual(len(msgs), 1)
        msg = msgs[0]

        # Process and verify
        self.consumer.process_single_message(msg, settings.QUEUE_URL)

        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "failed")
            self.assertEqual(doc.status, "failed")
            self.assertEqual(job.error_code, "size_mismatch")

        # Verify SQS message deleted
        remaining = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=1)
        self.assertEqual(len(remaining), 0)

    def test_validation_step_6_mime_mismatch(self):
        """
        Covers:
        6. Upload a file with a mismatched declared mime_type vs actual S3 ContentType.
        """
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "mismatch.pdf", "application/pdf", 10, s3_key # Declared application/pdf
            )
            db.commit()

        # Upload with mismatched ContentType 'image/png'
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=b"some bytes",
            ContentType="image/png"
        )
        self.uploaded_s3_keys.append(s3_key)

        # Retrieve message
        msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=2)
        self.assertEqual(len(msgs), 1)
        msg = msgs[0]

        # Process and verify
        self.consumer.process_single_message(msg, settings.QUEUE_URL)

        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "failed")
            self.assertEqual(doc.status, "failed")
            self.assertEqual(job.error_code, "content_type_mismatch")

        # Verify SQS message deleted
        remaining = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=1)
        self.assertEqual(len(remaining), 0)

    def test_validation_step_7_magic_byte_reject(self):
        """
        Covers:
        7. Rename a .jpg as .pdf and upload — verify magic byte check triggers failed with error_code = 'invalid_file_type'.
        """
        jpg_mock_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01..." # JPEG header
        file_size = len(jpg_mock_bytes)
        
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "renamed_jpg.pdf", "application/pdf", file_size, s3_key
            )
            db.commit()

        # Upload
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=jpg_mock_bytes,
            ContentType="application/pdf"
        )
        self.uploaded_s3_keys.append(s3_key)

        # Retrieve message
        msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=2)
        self.assertEqual(len(msgs), 1)
        msg = msgs[0]

        # Record temp paths to check Step 9 on failure path too
        temp_paths_recorded = []
        original_download = S3StorageProvider.download_file
        def wrapped_download(inst, remote_path, expected_size, expected_mime):
            path = original_download(inst, remote_path, expected_size, expected_mime)
            temp_paths_recorded.append(path)
            self.temp_files_to_check.append(path)
            return path

        with patch.object(S3StorageProvider, 'download_file', wrapped_download):
            self.consumer.process_single_message(msg, settings.QUEUE_URL)

        # Verify failed with invalid_file_type
        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "failed")
            self.assertEqual(doc.status, "failed")
            self.assertEqual(job.error_code, "invalid_file_type")

        # Verify temp file cleaned up on failure
        self.assertEqual(len(temp_paths_recorded), 1)
        self.assertFalse(os.path.exists(temp_paths_recorded[0]))

    def test_validation_step_8_password_protected_or_corrupt_pdf(self):
        """
        Covers:
        8. Upload a password-protected/corrupt PDF — verify error_code = 'extraction_failed'.
        """
        # A file starting with %PDF but containing corrupt/unparsable data
        corrupt_pdf_bytes = b"%PDF-1.4\ncorrupt_structure_no_trailer_or_pages\n"
        file_size = len(corrupt_pdf_bytes)
        
        session_id = uuid.uuid4()
        document_id = uuid.uuid4()
        s3_key = f"sessions/{session_id}/documents/{document_id}/original"
        
        with get_db() as db:
            self._create_session_in_db(db, session_id)
            self._create_document_and_job_in_db(
                db, session_id, document_id, "corrupt.pdf", "application/pdf", file_size, s3_key
            )
            db.commit()

        # Upload
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=corrupt_pdf_bytes,
            ContentType="application/pdf"
        )
        self.uploaded_s3_keys.append(s3_key)

        # Retrieve message
        msgs = self.sqs_client.receive_messages(queue_url=settings.QUEUE_URL, wait_time=2)
        self.assertEqual(len(msgs), 1)
        msg = msgs[0]

        # Record temp paths to check Step 9 on failure path too
        temp_paths_recorded = []
        original_download = S3StorageProvider.download_file
        def wrapped_download(inst, remote_path, expected_size, expected_mime):
            path = original_download(inst, remote_path, expected_size, expected_mime)
            temp_paths_recorded.append(path)
            self.temp_files_to_check.append(path)
            return path

        with patch.object(S3StorageProvider, 'download_file', wrapped_download):
            self.consumer.process_single_message(msg, settings.QUEUE_URL)

        # Verify failed with extraction_failed
        with get_db() as db:
            job = JobRepository.get_job_by_document_id(db, str(document_id))
            doc = JobRepository.get_document_by_id(db, str(document_id))
            self.assertEqual(job.status, "failed")
            self.assertEqual(doc.status, "failed")
            self.assertEqual(job.error_code, "extraction_failed")

        # Verify temp file cleaned up on failure
        self.assertEqual(len(temp_paths_recorded), 1)
        self.assertFalse(os.path.exists(temp_paths_recorded[0]))

if __name__ == "__main__":
    unittest.main()

import datetime
from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import NoResultFound
from app.models.db import get_db
from app.repositories.job_repository import JobRepository
from app.services.document_service import DocumentService
from app.utils.logger import logger

from app.errors import PermanentFailure, TransientFailure

class JobHandler:
    def __init__(self, worker_id: str):
        self.worker_id = worker_id

    def process_job(
        self, 
        document_id: str, 
        session_id: str
    ) -> None:
        """Coordinate the job execution, state transitions, and error routing."""
        logger.info(
            f"[Handler] Beginning job orchestration", 
            extra={"document_id": document_id, "session_id": session_id}
        )

        # 1. Transition status to 'downloading'
        try:
            with get_db() as db:
                job = JobRepository.get_job_by_document_id(db, document_id)
                if not job:
                    raise PermanentFailure(
                        "job_not_found", 
                        f"Processing job not registered for document ID: {document_id}"
                    )
                
                # Check if already completed
                if job.status == "completed":
                    logger.warning(
                        f"[Handler] Job is already completed. Skipping.", 
                        extra={"document_id": document_id}
                    )
                    return
                
                JobRepository.update_job_status(
                    db, 
                    document_id, 
                    "downloading", 
                    worker_id=self.worker_id,
                    started_at=datetime.datetime.now(datetime.timezone.utc)
                )
                db.commit()
        except (NoResultFound, IntegrityError) as db_err:
            # Likely session expired and cascades deleted the rows
            logger.error(
                f"[Handler] DB Integrity issue during initialization: {db_err}", 
                extra={"document_id": document_id}
            )
            # Throw permanent failure to discard from SQS
            raise PermanentFailure("database_integrity_error", str(db_err))

        # 2. Delegate processing to service layer
        try:
            with get_db() as db:
                DocumentService.process_document(db, document_id, session_id)
                
                # 3. Mark completed on success
                JobRepository.mark_job_completed(db, document_id)
                db.commit()
                
            logger.info(
                f"[Handler] Successfully completed job", 
                extra={"document_id": document_id}
            )

        except PermanentFailure as pf:
            logger.error(
                f"[Handler] Permanent failure encountered: {pf.message}", 
                extra={"document_id": document_id, "error_code": pf.error_code}
            )
            with get_db() as db:
                JobRepository.mark_job_failed(db, document_id, pf.error_code, pf.message)
                db.commit()
            # Do not re-throw, handle successfully at application layer (delete from SQS)
            
        except Exception as e:
            logger.error(
                f"[Handler] Transient or unhandled exception encountered: {str(e)}", 
                extra={"document_id": document_id}
            )
            # Re-throw as TransientFailure to let visibility timeout expire
            raise TransientFailure(str(e))

    def handle_dlq_job(self, document_id: str) -> None:
        """Mark a job as failed due to SQS Dead Letter Queue routing."""
        logger.warning(
            f"[Handler] Document routed to DLQ. Marking as failed.", 
            extra={"document_id": document_id}
        )
        try:
            with get_db() as db:
                JobRepository.mark_job_failed(
                    db, 
                    document_id, 
                    error_code="max_retries_exceeded",
                    error_message="Ingestion failed after maximum retry attempts in SQS queue."
                )
                db.commit()
        except Exception as e:
            logger.error(f"[Handler] Failed to update DB for DLQ document: {e}")

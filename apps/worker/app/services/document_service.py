import os
from typing import List, Tuple
from sqlalchemy.orm import Session

from app.repositories.job_repository import JobRepository
from app.services.extractor import ExtractorService
from app.services.storage_service import get_storage_provider
from app.errors import PermanentFailure
from app.utils.logger import logger

class DocumentService:
    @staticmethod
    def process_document(
        db: Session, 
        document_id: str, 
        session_id: str
    ) -> List[Tuple[int, str]]:
        """Coordinate document downloading, validation, and text extraction."""
        logger.info(
            f"[Service] Processing document workflow started", 
            extra={"document_id": document_id, "session_id": session_id}
        )

        # 1. Fetch document metadata from DB
        doc = JobRepository.get_document_by_id(db, document_id)
        if not doc:
            raise PermanentFailure(
                "document_not_found", 
                f"Document record not found for ID: {document_id}"
            )

        storage = get_storage_provider()
        extractor = ExtractorService()
        temp_path = None

        try:
            # 2. Download from remote storage provider (performs head check first)
            # Job status was transitioned to 'downloading' at JobHandler entry.
            temp_path = storage.download_file(
                remote_path=doc.s3_key,
                expected_size=doc.file_size_bytes,
                expected_mime=doc.mime_type
            )

            # 3. Transition to 'validating' and verify content
            JobRepository.update_job_status(db, document_id, "validating")
            db.commit()
            
            extractor.validate_document(temp_path, doc.mime_type)

            # 4. Transition to 'extracting' and parse text
            JobRepository.update_job_status(db, document_id, "extracting")
            db.commit()
            
            pages = extractor.extract_text(temp_path, doc.mime_type)

            logger.info(
                f"[Service] Processing document workflow completed extraction", 
                extra={"document_id": document_id, "session_id": session_id, "pages_count": len(pages)}
            )
            return pages

        finally:
            # 5. Clean up temporary files immediately
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                    logger.info(f"[Service] Cleaned up temporary file: {temp_path}")
                except Exception as cleanup_err:
                    logger.error(f"[Service] Failed to delete temp file {temp_path}: {cleanup_err}")

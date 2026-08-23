import os
from typing import List, Tuple
from sqlalchemy.orm import Session

from app.repositories.job_repository import JobRepository
from app.services.extractor import ExtractorService
from app.services.storage_service import get_storage_provider
from app.services.chunker import ChunkerService, Chunk
from app.services.embeddings import get_embedding_provider
from app.errors import PermanentFailure
from app.utils.logger import logger, log_exception

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

            # 5. Transition to 'chunking' and partition text
            JobRepository.update_job_status(db, document_id, "chunking")
            db.commit()

            chunker = ChunkerService()
            chunks = chunker.chunk_document(document_id, session_id, pages)

            JobRepository.update_job_status(db, document_id, "chunking", total_chunks=len(chunks))
            db.commit()

            # 6. Retrieve resume batch index and transition to 'embedding'
            job = JobRepository.get_job_by_document_id(db, document_id)
            resume_batch_index = job.checkpoint_index + 1 if (job and job.checkpoint_index is not None) else 0

            JobRepository.update_job_status(db, document_id, "embedding")
            db.commit()

            # 7. Batch chunks in groups of 50 and generate embeddings
            batches = [chunks[i:i + 50] for i in range(0, len(chunks), 50)]
            embeddings_provider = get_embedding_provider()

            for batch_idx, batch in enumerate(batches):
                if batch_idx < resume_batch_index:
                    logger.info(
                        f"[Service] Skipping embedding for batch index {batch_idx} (checkpoint resume is {resume_batch_index})",
                        extra={"document_id": document_id}
                    )
                    continue

                logger.info(
                    f"[Service] Generating embeddings for batch {batch_idx + 1}/{len(batches)} (size: {len(batch)})",
                    extra={"document_id": document_id}
                )
                for chunk in batch:
                    chunk.embedding = embeddings_provider.embed_chunk(chunk.content)

                # Map chunks to db values
                chunks_data = []
                for chunk in batch:
                    chunks_data.append({
                        "document_id": chunk.document_id,
                        "session_id": chunk.session_id,
                        "chunk_index": chunk.chunk_index,
                        "content": chunk.content,
                        "token_count": chunk.token_count,
                        "page_number": chunk.page_number,
                        "embedding": chunk.embedding,
                        "model_version": "titan-embed-text-v2"
                    })


                # Idempotently persist the batch
                try:
                    JobRepository.upsert_chunks(db, chunks_data)
                except Exception as db_err:
                    log_exception(
                        f"[Service] Database persistence failed for batch {batch_idx}: {db_err}",
                        extra={"document_id": document_id}
                    )
                    raise PermanentFailure("persistence_failed", str(db_err))

                # Update progress in DB
                processed = (batch_idx + 1) * 50
                progress = int((processed / len(chunks)) * 100)
                JobRepository.update_job_status(
                    db,
                    document_id,
                    "embedding",
                    processed_chunks=min(processed, len(chunks)),
                    progress_pct=min(progress, 99),  # Reserve 100% for final completion
                    checkpoint_index=batch_idx
                )
                db.commit()

            logger.info(
                f"[Service] Processing document workflow completed chunking and embedding", 
                extra={"document_id": document_id, "session_id": session_id, "total_chunks": len(chunks)}
            )
            return batches


        finally:
            # 5. Clean up temporary files immediately
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                    logger.info(f"[Service] Cleaned up temporary file: {temp_path}")
                except Exception as cleanup_err:
                    log_exception(f"[Service] Failed to delete temp file {temp_path}: {cleanup_err}")

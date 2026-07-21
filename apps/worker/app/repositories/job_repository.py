import datetime
from typing import Optional
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.models import Document, ProcessingJob, DocumentChunk

class JobRepository:
    @staticmethod
    def get_document_by_id(db: Session, document_id: str) -> Optional[Document]:
        """Fetch the document record associated with the given ID."""
        return db.query(Document).filter(Document.id == document_id).first()

    @staticmethod
    def get_job_by_document_id(db: Session, document_id: str) -> Optional[ProcessingJob]:
        """Fetch the processing job associated with the given document ID."""
        return db.query(ProcessingJob).filter(ProcessingJob.document_id == document_id).first()

    @staticmethod
    def update_job_status(
        db: Session, 
        document_id: str, 
        status: str, 
        worker_id: Optional[str] = None,
        started_at: Optional[datetime.datetime] = None,
        total_chunks: Optional[int] = None,
        processed_chunks: Optional[int] = None,
        progress_pct: Optional[int] = None,
        checkpoint_index: Optional[int] = None
    ) -> Optional[ProcessingJob]:
        """Update job progress fields and transition its state."""
        job = JobRepository.get_job_by_document_id(db, document_id)
        if job:
            job.status = status
            if worker_id is not None:
                job.worker_id = worker_id
            if started_at is not None:
                job.started_at = started_at
            if total_chunks is not None:
                job.total_chunks = total_chunks
            if processed_chunks is not None:
                job.processed_chunks = processed_chunks
            if progress_pct is not None:
                job.progress_pct = progress_pct
            if checkpoint_index is not None:
                job.checkpoint_index = checkpoint_index
            
            job.updated_at = datetime.datetime.now(datetime.timezone.utc)
            db.flush()  # Push changes to DB but keep in transaction
        return job


    @staticmethod
    def mark_job_completed(db: Session, document_id: str) -> None:
        """Atomically transition processing job and document statuses to completed."""
        job = JobRepository.get_job_by_document_id(db, document_id)
        if job:
            job.status = "completed"
            job.progress_pct = 100
            if job.total_chunks is not None:
                job.processed_chunks = job.total_chunks
                total_batches = (job.total_chunks + 49) // 50
                job.checkpoint_index = max(0, total_batches - 1)
            job.completed_at = datetime.datetime.now(datetime.timezone.utc)
            job.updated_at = datetime.datetime.now(datetime.timezone.utc)

        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "completed"
            doc.updated_at = datetime.datetime.now(datetime.timezone.utc)


    @staticmethod
    def mark_job_failed(db: Session, document_id: str, error_code: str, error_message: str) -> None:
        """Atomically transition processing job and document statuses to failed."""
        job = JobRepository.get_job_by_document_id(db, document_id)
        if job:
            job.status = "failed"
            job.error_code = error_code
            job.error_message = error_message
            job.updated_at = datetime.datetime.now(datetime.timezone.utc)

        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            doc.updated_at = datetime.datetime.now(datetime.timezone.utc)

    @staticmethod
    def upsert_chunks(db: Session, chunks_data: list[dict]) -> None:
        """Idempotently insert or update a batch of document chunks using ON CONFLICT."""
        if not chunks_data:
            return
        stmt = insert(DocumentChunk).values(chunks_data)
        stmt = stmt.on_conflict_do_update(
            index_elements=['document_id', 'chunk_index'],
            set_={
                'embedding':     stmt.excluded.embedding,
                'content':       stmt.excluded.content,
                'token_count':   stmt.excluded.token_count,
                'model_version': stmt.excluded.model_version,
                'updated_at':    func.now(),
            }
        )
        db.execute(stmt)

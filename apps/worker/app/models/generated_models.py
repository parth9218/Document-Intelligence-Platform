from typing import Any, Optional
import datetime
import uuid

from sqlalchemy import ARRAY, BigInteger, DateTime, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, SmallInteger, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import NullType

class Base(DeclarativeBase):
    type_annotation_map = {
        Any: NullType
    }


class PrismaMigrations(Base):
    __tablename__ = '_prisma_migrations'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='_prisma_migrations_pkey'),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    migration_name: Mapped[str] = mapped_column(String(255), nullable=False)
    started_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    applied_steps_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    finished_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    logs: Mapped[Optional[str]] = mapped_column(Text)
    rolled_back_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))


class AuditLog(Base):
    __tablename__ = 'audit_log'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='audit_log_pkey'),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid)
    metadata_: Mapped[Optional[dict]] = mapped_column('metadata', JSONB)


class Sessions(Base):
    __tablename__ = 'sessions'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='sessions_pkey'),
        Index('sessions_session_token_key', 'session_token', unique=True)
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    session_token: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    last_active_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    ip_address: Mapped[Optional[Any]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)

    documents: Mapped[list['Documents']] = relationship('Documents', back_populates='session')
    query_logs: Mapped[list['QueryLogs']] = relationship('QueryLogs', back_populates='session')


class Documents(Base):
    __tablename__ = 'documents'
    __table_args__ = (
        ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE', onupdate='CASCADE', name='documents_session_id_fkey'),
        PrimaryKeyConstraint('id', name='documents_pkey'),
        Index('documents_s3_key_key', 's3_key', unique=True),
        Index('documents_session_id_idx', 'session_id')
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending_upload'::text"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    session: Mapped['Sessions'] = relationship('Sessions', back_populates='documents')
    document_chunks: Mapped[list['DocumentChunks']] = relationship('DocumentChunks', back_populates='document')
    processing_jobs: Mapped[list['ProcessingJobs']] = relationship('ProcessingJobs', back_populates='document')


class QueryLogs(Base):
    __tablename__ = 'query_logs'
    __table_args__ = (
        ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE', onupdate='CASCADE', name='query_logs_session_id_fkey'),
        PrimaryKeyConstraint('id', name='query_logs_pkey')
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    query_embedding: Mapped[Optional[Any]] = mapped_column(NullType)
    retrieved_chunk_ids: Mapped[Optional[list[uuid.UUID]]] = mapped_column(ARRAY(Uuid()))
    answer_text: Mapped[Optional[str]] = mapped_column(Text)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    model_version: Mapped[Optional[str]] = mapped_column(Text)

    session: Mapped['Sessions'] = relationship('Sessions', back_populates='query_logs')


class DocumentChunks(Base):
    __tablename__ = 'document_chunks'
    __table_args__ = (
        ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE', onupdate='CASCADE', name='document_chunks_document_id_fkey'),
        PrimaryKeyConstraint('id', name='document_chunks_pkey'),
        Index('document_chunks_document_id_chunk_index_key', 'document_id', 'chunk_index', unique=True),
        Index('document_chunks_embedding_hnsw_idx', 'embedding'),
        Index('document_chunks_session_id_idx', 'session_id')
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'titan-embed-text-v2'::text"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    page_number: Mapped[Optional[int]] = mapped_column(Integer)
    token_count: Mapped[Optional[int]] = mapped_column(Integer)
    embedding: Mapped[Optional[Any]] = mapped_column(NullType)

    document: Mapped['Documents'] = relationship('Documents', back_populates='document_chunks')


class ProcessingJobs(Base):
    __tablename__ = 'processing_jobs'
    __table_args__ = (
        ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE', onupdate='CASCADE', name='processing_jobs_document_id_fkey'),
        PrimaryKeyConstraint('id', name='processing_jobs_pkey'),
        Index('processing_jobs_document_id_key', 'document_id', unique=True),
        Index('processing_jobs_session_id_status_idx', 'session_id', 'status')
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'pending_upload'::text"))
    processed_chunks: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    progress_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text('0'))
    checkpoint_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("'-1'::integer"))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    total_chunks: Mapped[Optional[int]] = mapped_column(Integer)
    worker_id: Mapped[Optional[str]] = mapped_column(Text)
    error_code: Mapped[Optional[str]] = mapped_column(Text)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    document: Mapped['Documents'] = relationship('Documents', back_populates='processing_jobs')

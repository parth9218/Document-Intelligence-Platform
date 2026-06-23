import { prisma, pgPool } from '../db';
import crypto from 'crypto';
import { s3Service } from './s3.service';
import { config } from '../config';
import { isSupportedMimeType } from '../config/file-types';
import { NotFoundError, ConflictError, RateLimitError, ValidationError } from '../errors/app-error';
import { logger } from '../utils/logger';
import { PoolClient } from 'pg';

export interface DocumentInitInput {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface DocumentUploadResult {
  filename: string;
  status: 'ready' | 'rejected';
  documentId?: string;
  uploadUrl?: string;
  uploadFields?: Record<string, string>;
  s3Key?: string;
  error?: string;
  message?: string;
}

class DocumentService {
  /**
   * Initializes a batch of document uploads, running validations and generating S3 urls.
   */
  public async initializeUploadBatch(
    sessionId: string,
    documents: DocumentInitInput[]
  ): Promise<DocumentUploadResult[]> {
    const results: DocumentUploadResult[] = new Array(documents.length);
    const validFilesInfo: Array<{
      index: number;
      filename: string;
      mimeType: string;
      fileSizeBytes: number;
    }> = [];

    // Tier 1 Validation - Per-file
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      if (!doc || typeof doc !== 'object') {
        results[i] = {
          filename: 'unknown',
          status: 'rejected',
          error: 'invalid_file_metadata',
          message: 'Invalid file object.',
        };
        continue;
      }

      const { filename, mimeType, fileSizeBytes } = doc;

      if (!filename || !mimeType || typeof fileSizeBytes !== 'number') {
        results[i] = {
          filename: filename || 'unknown',
          status: 'rejected',
          error: 'invalid_file_metadata',
          message: 'filename (string), mimeType (string), and fileSizeBytes (number) are required.',
        };
        continue;
      }

      if (!isSupportedMimeType(mimeType)) {
        results[i] = {
          filename,
          status: 'rejected',
          error: 'invalid_mime_type',
          message: 'Unsupported file type.',
        };
        continue;
      }

      if (fileSizeBytes < config.limits.fileSizeMinBytes || fileSizeBytes > config.limits.fileSizeMaxBytes) {
        results[i] = {
          filename,
          status: 'rejected',
          error: 'file_too_large',
          message: `File size must be between ${config.limits.fileSizeMinBytes} byte and 5 MB.`,
        };
        continue;
      }

      validFilesInfo.push({
        index: i,
        filename,
        mimeType,
        fileSizeBytes,
      });
    }

    if (validFilesInfo.length > 0) {
      // Tier 2 Validation - Concurrency limit
      const activeJobsCount = await prisma.processingJob.count({
        where: {
          session_id: sessionId,
          status: {
            in: ['pending_upload', 'uploaded', 'downloading', 'validating', 'extracting', 'chunking', 'embedding'],
          },
        },
      });

      if (activeJobsCount + validFilesInfo.length > config.limits.concurrencyMaxJobs) {
        logger.warn('Concurrency limit exceeded on batch initialization', { sessionId, activeJobsCount, requestCount: validFilesInfo.length });
        throw new RateLimitError(
          `Active uploads/processing jobs limit exceeded (max ${config.limits.concurrencyMaxJobs}).`,
          'concurrency_limit_exceeded'
        );
      }

      // Tier 2 Validation - Storage quota limit
      const aggregateResult = await prisma.document.aggregate({
        where: {
          session_id: sessionId,
          status: {
            notIn: ['expired', 'failed', 'cancelled'],
          },
        },
        _sum: {
          file_size_bytes: true,
        },
      });

      const existingBytes = Number(aggregateResult._sum.file_size_bytes || BigInt(0));
      const batchBytes = validFilesInfo.reduce((sum, f) => sum + f.fileSizeBytes, 0);

      if (existingBytes + batchBytes > config.limits.storageQuotaMaxBytes) {
        logger.warn('Storage quota exceeded on batch initialization', { sessionId, existingBytes, batchBytes });
        throw new ValidationError(
          `Cumulative storage limit of 50 MB exceeded for this session.`,
          'storage_quota_exceeded'
        );
      }

      // Generate Presigned POST parameters for valid files
      const readyFilesData: Array<{
        index: number;
        filename: string;
        mimeType: string;
        fileSizeBytes: number;
        documentId: string;
        s3Key: string;
        uploadUrl: string;
        uploadFields: Record<string, string>;
      }> = [];
      for (const file of validFilesInfo) {
        const documentId = crypto.randomUUID();
        const s3Key = `sessions/${sessionId}/documents/${documentId}/original`;

        const presignedPost = await s3Service.generatePresignedPost(s3Key, file.mimeType);

        readyFilesData.push({
          index: file.index,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSizeBytes: file.fileSizeBytes,
          documentId,
          s3Key,
          uploadUrl: presignedPost.url,
          uploadFields: presignedPost.fields,
        });
      }

      // Commit DB records atomically in a transaction
      await prisma.$transaction(async (tx) => {
        for (const item of readyFilesData) {
          await tx.document.create({
            data: {
              id: item.documentId,
              session_id: sessionId,
              filename: item.filename,
              mime_type: item.mimeType,
              file_size_bytes: BigInt(item.fileSizeBytes),
              s3_key: item.s3Key,
              status: 'pending_upload',
            },
          });

          await tx.processingJob.create({
            data: {
              document_id: item.documentId,
              session_id: sessionId,
              status: 'pending_upload',
              progress_pct: 0,
              checkpoint_index: -1,
            },
          });
        }
      });

      // Populate results
      for (const item of readyFilesData) {
        results[item.index] = {
          filename: item.filename,
          status: 'ready',
          documentId: item.documentId,
          uploadUrl: item.uploadUrl,
          uploadFields: item.uploadFields,
          s3Key: item.s3Key,
        };
      }
    }

    return results;
  }

  /**
   * Confirms a document has been successfully uploaded to S3, updating the DB states.
   */
  public async confirmUpload(sessionId: string, documentId: string): Promise<void> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { processing_job: true },
    });

    // ownership check - throw NotFound to prevent ID enumeration
    if (!doc || doc.session_id !== sessionId) {
      logger.warn('Document confirm-upload failed: not found or unowned', { sessionId, documentId });
      throw new NotFoundError('Document not found');
    }

    // idempotency guard
    const currentStatus = doc.processing_job?.status || doc.status;
    if (currentStatus !== 'pending_upload') {
      logger.warn('Document confirm-upload failed: already confirmed', { sessionId, documentId, currentStatus });
      throw new ConflictError('already_confirmed', 'already_confirmed');
    }

    // transition statuses atomically
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { status: 'uploaded' },
      }),
      prisma.processingJob.update({
        where: { document_id: documentId },
        data: { status: 'uploaded' },
      }),
    ]);

    logger.info('Confirmed document upload', { sessionId, documentId });
  }

  /**
   * Fetches document processing details and chunk counters.
   */
  public async getDocumentStatus(sessionId: string, documentId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { processing_job: true },
    });

    if (!doc || doc.session_id !== sessionId) {
      throw new NotFoundError('Document not found');
    }

    const job = doc.processing_job;

    return {
      documentId: doc.id,
      status: job ? job.status : doc.status,
      progressPct: job ? job.progress_pct : 0,
      processedChunks: job ? job.processed_chunks : 0,
      totalChunks: job ? job.total_chunks : null,
      errorCode: job ? job.error_code : null,
      errorMessage: job ? job.error_message : null,
    };
  }

  /**
   * Prepares a raw PG client, executes LISTEN, and hooks up the notification callback.
   */
  public async connectProgressStream(
    sessionId: string,
    documentId: string,
    onNotification: (payload: any) => void,
    onClose: (cleanup: () => Promise<void>) => void
  ): Promise<any> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { processing_job: true },
    });

    if (!doc || doc.session_id !== sessionId) {
      throw new NotFoundError('Document not found');
    }

    const client: PoolClient = await pgPool.connect();
    
    await client.query('LISTEN progress_channel');

    const handleNotification = (msg: any) => {
      if (msg.channel === 'progress_channel') {
        try {
          const payload = JSON.parse(msg.payload || '{}');
          if (payload.document_id === documentId) {
            onNotification(payload);
          }
        } catch (parseErr) {
          logger.error('Error parsing pg notification payload inside stream:', parseErr);
        }
      }
    };

    client.on('notification', handleNotification);

    const cleanup = async () => {
      client.off('notification', handleNotification);
      try {
        await client.query('UNLISTEN progress_channel');
      } catch (err) {
        logger.error('Error on progress stream UNLISTEN:', err);
      } finally {
        client.release();
      }
    };

    onClose(cleanup);

    return {
      documentId: doc.id,
      status: doc.processing_job?.status || doc.status,
      progressPct: doc.processing_job?.progress_pct || 0,
      processedChunks: doc.processing_job?.processed_chunks || 0,
      totalChunks: doc.processing_job?.total_chunks || null,
      errorCode: doc.processing_job?.error_code || null,
      errorMessage: doc.processing_job?.error_message || null,
    };
  }
}

export const documentService = new DocumentService();

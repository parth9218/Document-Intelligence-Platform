import { Router, Request, Response } from 'express';
import { prisma, pgPool } from '../db';
import crypto from 'crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const router = Router();

const s3Endpoint = process.env.AWS_ENDPOINT_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4566');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: s3Endpoint,
  forcePathStyle: s3Endpoint ? true : undefined,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock',
  },
});

const S3_BUCKET = process.env.S3_BUCKET || 'documents-bucket';

// Helper to validate UUID format
function isValidUUID(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

// POST /api/documents - Batch initialization
router.post('/', async (req: Request, res: Response) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No active session' });
  }

  const { documents } = req.body;
  if (!Array.isArray(documents)) {
    return res.status(400).json({
      error: 'invalid_request_body',
      message: 'Request body must contain a documents array.',
    });
  }

  const results: any[] = new Array(documents.length);
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
        status: 'rejected',
        error: 'invalid_file_metadata',
        message: 'Invalid file object.',
      };
      continue;
    }

    const { filename, mimeType, fileSizeBytes } = doc;

    if (typeof filename !== 'string' || typeof mimeType !== 'string' || typeof fileSizeBytes !== 'number') {
      results[i] = {
        filename: filename || 'unknown',
        status: 'rejected',
        error: 'invalid_file_metadata',
        message: 'filename (string), mimeType (string), and fileSizeBytes (number) are required.',
      };
      continue;
    }

    if (mimeType !== 'application/pdf' && mimeType !== 'text/plain') {
      results[i] = {
        filename,
        status: 'rejected',
        error: 'invalid_mime_type',
        message: 'Only application/pdf and text/plain files are supported.',
      };
      continue;
    }

    if (fileSizeBytes < 1 || fileSizeBytes > 5242880) {
      results[i] = {
        filename,
        status: 'rejected',
        error: 'file_too_large',
        message: 'File size must be between 1 byte and 5 MB (5,242,880 bytes).',
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

  // Tier 2 Validation - Batch-level
  if (validFilesInfo.length > 0) {
    const sessionId = req.session.id;

    // 1. Concurrency Check
    const activeJobsCount = await prisma.processingJob.count({
      where: {
        session_id: sessionId,
        status: {
          in: ['pending_upload', 'uploaded', 'downloading', 'validating', 'extracting', 'chunking', 'embedding'],
        },
      },
    });

    if (activeJobsCount + validFilesInfo.length > 5) {
      return res.status(429).json({
        error: 'concurrency_limit_exceeded',
        message: 'Active uploads/processing jobs limit exceeded (max 5).',
      });
    }

    // 2. Storage Quota Check
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

    if (existingBytes + batchBytes > 52428800) {
      return res.status(400).json({
        error: 'storage_quota_exceeded',
        error_code: 'storage_quota_exceeded',
        message: 'Cumulative storage limit of 50 MB (52,428,800 bytes) exceeded for this session.',
      });
    }

    // Generate S3 Presigned URL & Metadata for each valid file
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

      try {
        const { url, fields } = await createPresignedPost(s3Client, {
          Bucket: S3_BUCKET,
          Key: s3Key,
          Conditions: [
            ['content-length-range', 1, 5242880],
            ['eq', '$Content-Type', file.mimeType],
          ],
          Fields: {
            'Content-Type': file.mimeType,
          },
          Expires: 300, // 5 minutes TTL
        });

        readyFilesData.push({
          index: file.index,
          filename: file.filename,
          mimeType: file.mimeType,
          fileSizeBytes: file.fileSizeBytes,
          documentId,
          s3Key,
          uploadUrl: url,
          uploadFields: fields,
        });
      } catch (s3Err) {
        console.error('Failed to generate presigned POST from AWS SDK:', s3Err);
        return res.status(500).json({
          error: 's3_presign_failed',
          message: 'Internal server error generating presigned upload parameters.',
        });
      }
    }

    // Atomic DB write
    try {
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
    } catch (dbErr) {
      console.error('Database transaction failed for document initialization:', dbErr);
      return res.status(500).json({
        error: 'database_error',
        message: 'Internal server error saving document initialization records.',
      });
    }

    // Construct responses
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

  return res.status(200).json({ results });
});

// POST /api/documents/:id/confirm-upload - Confirm successful S3 upload
router.post('/:id/confirm-upload', async (req: Request, res: Response) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No active session' });
  }

  const documentId = req.params.id;
  if (!isValidUUID(documentId)) {
    return res.status(404).json({ error: 'Document not found' });
  }

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { processing_job: true },
    });

    // 1. Session ownership check
    if (!doc || doc.session_id !== req.session.id) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // 2. Idempotency guard / check status
    const currentStatus = doc.processing_job?.status || doc.status;
    if (currentStatus !== 'pending_upload') {
      return res.status(409).json({ error: 'already_confirmed' });
    }

    // 3. Atomic status transition
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

    return res.status(200).json({ status: 'uploaded' });
  } catch (err) {
    console.error('Failed to confirm upload:', err);
    return res.status(500).json({ error: 'Internal server error confirming upload' });
  }
});

// GET /api/documents/:id/status - Status polling fallback
router.get('/:id/status', async (req: Request, res: Response) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No active session' });
  }

  const documentId = req.params.id;
  if (!isValidUUID(documentId)) {
    return res.status(404).json({ error: 'Document not found' });
  }

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { processing_job: true },
    });

    if (!doc || doc.session_id !== req.session.id) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const job = doc.processing_job;

    return res.status(200).json({
      documentId: doc.id,
      status: job ? job.status : doc.status,
      progressPct: job ? job.progress_pct : 0,
      processedChunks: job ? job.processed_chunks : 0,
      totalChunks: job ? job.total_chunks : null,
      errorCode: job ? job.error_code : null,
      errorMessage: job ? job.error_message : null,
    });
  } catch (err) {
    console.error('Failed to fetch document status:', err);
    return res.status(500).json({ error: 'Internal server error fetching document status' });
  }
});

// GET /api/documents/:id/progress - SSE stream for real-time progress updates
router.get('/:id/progress', async (req: Request, res: Response) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No active session' });
  }

  const documentId = req.params.id;
  if (!isValidUUID(documentId)) {
    return res.status(404).json({ error: 'Document not found' });
  }

  let doc;
  try {
    doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { processing_job: true },
    });
  } catch (err) {
    console.error('Failed to query document for SSE connection:', err);
    return res.status(500).json({ error: 'Internal server error connecting stream' });
  }

  if (!doc || doc.session_id !== req.session.id) {
    return res.status(404).json({ error: 'Document not found' });
  }

  let client: any;
  try {
    client = await pgPool.connect();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial status frame
    const job = doc.processing_job;
    const initialPayload = {
      documentId: doc.id,
      status: job ? job.status : doc.status,
      progressPct: job ? job.progress_pct : 0,
      processedChunks: job ? job.processed_chunks : 0,
      totalChunks: job ? job.total_chunks : null,
      errorCode: job ? job.error_code : null,
      errorMessage: job ? job.error_message : null,
    };
    res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

    await client.query('LISTEN progress_channel');

    const handleNotification = (msg: any) => {
      if (msg.channel === 'progress_channel') {
        try {
          const payload = JSON.parse(msg.payload || '{}');
          if (payload.document_id === documentId) {
            res.write(`data: ${JSON.stringify({
              documentId: payload.document_id,
              status: payload.status,
              progressPct: payload.progress_pct,
              processedChunks: payload.processed_chunks,
              totalChunks: payload.total_chunks,
              errorCode: payload.error_code,
              errorMessage: payload.error_message,
            })}\n\n`);
          }
        } catch (parseErr) {
          console.error('Error parsing pg notification payload:', parseErr);
        }
      }
    };

    client.on('notification', handleNotification);

    req.on('close', async () => {
      client.off('notification', handleNotification);
      try {
        await client.query('UNLISTEN progress_channel');
      } catch (unlistenErr) {
        console.error('Error during UNLISTEN execution:', unlistenErr);
      } finally {
        client.release();
      }
    });

  } catch (err) {
    console.error('SSE initialization connection error:', err);
    if (client) {
      client.release();
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error establishing progress stream' });
    }
  }
});

export default router;

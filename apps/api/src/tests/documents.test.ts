import request from 'supertest';
import app from '../app';
import { prisma } from '../db';
import { sign } from '../middlewares/session';
import crypto from 'crypto';
import { runCleanupJob } from '../jobs/cleanup';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-key-change-in-production-12345';
const COOKIE_NAME = 'session_token';

describe('Document Upload & Tracking API Tests', () => {
  let sessionId: string;
  let sessionToken: string;
  let authCookie: string;

  beforeAll(async () => {
    // Clean up any existing data
    await prisma.processingJob.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.session.deleteMany({});

    // Create a mock active session
    const tokenRaw = crypto.randomBytes(32).toString('hex');
    sessionToken = sign(tokenRaw, SESSION_SECRET);
    authCookie = `${COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

    const session = await prisma.session.create({
      data: {
        session_token: sessionToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    // Final database cleanup
    await prisma.processingJob.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear documents and jobs between tests to ensure isolation
    await prisma.processingJob.deleteMany({});
    await prisma.document.deleteMany({});
  });

  describe('POST /api/documents - Batch Initialization', () => {
    it('should successfully initialize valid files and return ready status with presigned fields', async () => {
      const payload = {
        documents: [
          { filename: 'doc1.pdf', mimeType: 'application/pdf', fileSizeBytes: 1024 },
          { filename: 'doc2.txt', mimeType: 'text/plain', fileSizeBytes: 2048 },
        ],
      };

      const response = await request(app)
        .post('/api/documents')
        .set('Cookie', authCookie)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(2);

      const [res1, res2] = response.body.results;
      
      expect(res1.status).toBe('ready');
      expect(res1.filename).toBe('doc1.pdf');
      expect(res1.documentId).toBeDefined();
      expect(res1.uploadUrl).toBeDefined();
      expect(res1.uploadFields).toBeDefined();
      expect(res1.s3Key).toBe(`sessions/${sessionId}/documents/${res1.documentId}/original`);

      expect(res2.status).toBe('ready');
      expect(res2.filename).toBe('doc2.txt');

      // Verify DB entries were created in pending_upload state
      const dbDoc = await prisma.document.findUnique({
        where: { id: res1.documentId },
        include: { processing_job: true },
      });

      expect(dbDoc).toBeDefined();
      expect(dbDoc?.status).toBe('pending_upload');
      expect(dbDoc?.filename).toBe('doc1.pdf');
      expect(dbDoc?.mime_type).toBe('application/pdf');
      expect(Number(dbDoc?.file_size_bytes)).toBe(1024);
      expect(dbDoc?.processing_job).toBeDefined();
      expect(dbDoc?.processing_job?.status).toBe('pending_upload');
      expect(dbDoc?.processing_job?.progress_pct).toBe(0);
    });

    it('should reject invalid files in Tier 1 per-file validation and keep overall HTTP 200', async () => {
      const payload = {
        documents: [
          { filename: 'invalid_mime.png', mimeType: 'image/png', fileSizeBytes: 1024 },
          { filename: 'too_large.pdf', mimeType: 'application/pdf', fileSizeBytes: 10 * 1024 * 1024 },
          { filename: 'too_small.pdf', mimeType: 'application/pdf', fileSizeBytes: 0 },
          { filename: 'valid.pdf', mimeType: 'application/pdf', fileSizeBytes: 500 },
        ],
      };

      const response = await request(app)
        .post('/api/documents')
        .set('Cookie', authCookie)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(4);

      const [res1, res2, res3, res4] = response.body.results;

      expect(res1.status).toBe('rejected');
      expect(res1.error).toBe('invalid_mime_type');
      
      expect(res2.status).toBe('rejected');
      expect(res2.error).toBe('file_too_large');

      expect(res3.status).toBe('rejected');
      expect(res3.error).toBe('file_too_large'); // 0 bytes is invalid size

      expect(res4.status).toBe('ready');

      // Verify DB records exist ONLY for the valid one
      const dbDocs = await prisma.document.findMany({
        where: { session_id: sessionId },
      });
      expect(dbDocs).toHaveLength(1);
      expect(dbDocs[0].filename).toBe('valid.pdf');
    });

    it('should return HTTP 429 when batch-level upload concurrency limit is exceeded', async () => {
      // Seed 5 active jobs in the DB
      const activeStates = ['pending_upload', 'uploaded', 'downloading', 'validating', 'extracting'];
      for (let i = 0; i < 5; i++) {
        const docId = crypto.randomUUID();
        await prisma.document.create({
          data: {
            id: docId,
            session_id: sessionId,
            filename: `active_${i}.pdf`,
            mime_type: 'application/pdf',
            file_size_bytes: 1024,
            s3_key: `sessions/${sessionId}/documents/${docId}/original`,
            status: activeStates[i],
          },
        });
        await prisma.processingJob.create({
          data: {
            document_id: docId,
            session_id: sessionId,
            status: activeStates[i],
          },
        });
      }

      // Try initializing one more document
      const payload = {
        documents: [{ filename: 'new.pdf', mimeType: 'application/pdf', fileSizeBytes: 1024 }],
      };

      const response = await request(app)
        .post('/api/documents')
        .set('Cookie', authCookie)
        .send(payload);

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('concurrency_limit_exceeded');

      // Ensure no new document was created
      const dbDocsCount = await prisma.document.count({
        where: { filename: 'new.pdf' },
      });
      expect(dbDocsCount).toBe(0);
    });

    it('should return HTTP 400 when batch-level storage quota is exceeded', async () => {
      // Seed close to 50MB of documents (e.g. 48MB)
      const docId = crypto.randomUUID();
      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'huge.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 48 * 1024 * 1024, // 48 MB
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'completed',
        },
      });
      await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'completed',
        },
      });

      // Try uploading a 4MB batch (brings total to 52MB > 50MB)
      const payload = {
        documents: [{ filename: 'extra.pdf', mimeType: 'application/pdf', fileSizeBytes: 4 * 1024 * 1024 }],
      };

      const response = await request(app)
        .post('/api/documents')
        .set('Cookie', authCookie)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('storage_quota_exceeded');

      // Ensure it was not inserted
      const dbDocsCount = await prisma.document.count({
        where: { filename: 'extra.pdf' },
      });
      expect(dbDocsCount).toBe(0);
    });
  });

  describe('POST /api/documents/:id/confirm-upload', () => {
    it('should transition document and job statuses atomically to uploaded', async () => {
      const docId = crypto.randomUUID();
      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'confirm.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'pending_upload',
        },
      });
      await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'pending_upload',
        },
      });

      const response = await request(app)
        .post(`/api/documents/${docId}/confirm-upload`)
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'uploaded' });

      // Verify db changes
      const updatedDoc = await prisma.document.findUnique({
        where: { id: docId },
        include: { processing_job: true },
      });
      expect(updatedDoc?.status).toBe('uploaded');
      expect(updatedDoc?.processing_job?.status).toBe('uploaded');
    });

    it('should return HTTP 404 if document does not exist or belongs to another session', async () => {
      // 1. Random document ID that doesn't exist
      const fakeId = crypto.randomUUID();
      const res1 = await request(app)
        .post(`/api/documents/${fakeId}/confirm-upload`)
        .set('Cookie', authCookie);
      expect(res1.status).toBe(404);

      // 2. Document that belongs to another session
      const otherSession = await prisma.session.create({
        data: {
          session_token: 'other-token-sig',
          expires_at: new Date(Date.now() + 100000),
        },
      });

      const otherDocId = crypto.randomUUID();
      await prisma.document.create({
        data: {
          id: otherDocId,
          session_id: otherSession.id,
          filename: 'other.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${otherSession.id}/documents/${otherDocId}/original`,
          status: 'pending_upload',
        },
      });

      const res2 = await request(app)
        .post(`/api/documents/${otherDocId}/confirm-upload`)
        .set('Cookie', authCookie);

      expect(res2.status).toBe(404);
    });

    it('should return HTTP 409 conflict if document upload is already confirmed', async () => {
      const docId = crypto.randomUUID();
      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'already.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'uploaded',
        },
      });
      await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'uploaded',
        },
      });

      const response = await request(app)
        .post(`/api/documents/${docId}/confirm-upload`)
        .set('Cookie', authCookie);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('already_confirmed');
    });
  });

  describe('GET /api/documents/status - Session status polling fallback', () => {
    it('should return empty list when session has no documents', async () => {
      const response = await request(app)
        .get('/api/documents/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ documents: [] });
    });

    it('should return list of all documents for session with correct schemas', async () => {
      const docId = crypto.randomUUID();
      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'status.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'embedding',
        },
      });
      await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'embedding',
          progress_pct: 60,
          processed_chunks: 6,
          total_chunks: 10,
          error_code: null,
          error_message: null,
        },
      });

      const response = await request(app)
        .get('/api/documents/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.documents).toHaveLength(1);
      
      const docStatus = response.body.documents[0];
      expect(docStatus.documentId).toBe(docId);
      expect(docStatus.filename).toBe('status.pdf');
      expect(docStatus.mimeType).toBe('application/pdf');
      expect(docStatus.fileSizeBytes).toBe(100);
      expect(docStatus.status).toBe('embedding');
      expect(docStatus.progressPct).toBe(60);
      expect(docStatus.processedChunks).toBe(6);
      expect(docStatus.totalChunks).toBe(10);
      expect(docStatus.errorCode).toBeNull();
      expect(docStatus.errorMessage).toBeNull();
      expect(docStatus.createdAt).toBeDefined();
    });
  });

  describe('GET /api/documents/progress - Session SSE stream progress update tracking', () => {
    it('should establish SSE, send event: snapshot, and stream event: update on DB notify', async () => {
      const docId = crypto.randomUUID();
      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'progress.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'downloading',
        },
      });
      const job = await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'downloading',
          progress_pct: 10,
          processed_chunks: 1,
          total_chunks: 10,
        },
      });

      const http = require('http');
      const server = http.createServer(app);

      const port = await new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve(addr.port);
        });
      });

      let responseText = '';
      let responseHeaders: any;

      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          {
            hostname: '127.0.0.1',
            port: port,
            path: '/api/documents/progress',
            headers: {
              Cookie: authCookie,
              Accept: 'text/event-stream',
            },
          },
          async (res: any) => {
            responseHeaders = res.headers;

            res.on('data', async (chunk: any) => {
              responseText += chunk.toString();
              
              // Once we receive the initial snapshot event, trigger the DB update to cause a NOTIFY
              if (responseText.includes('event: snapshot') && !responseText.includes('event: update')) {
                // Update processing job status to trigger PG NOTIFY
                prisma.processingJob.update({
                  where: { id: job.id },
                  data: {
                    status: 'extracting',
                    progress_pct: 50,
                    processed_chunks: 5,
                  },
                }).catch((err) => reject(err));
              }

              // Resolve once both snapshot and update event frames have been received
              if (responseText.includes('event: snapshot') && responseText.includes('event: update')) {
                req.destroy();
                server.close(() => {
                  resolve();
                });
              }
            });
          }
        );

        req.on('error', (err: any) => {
          // Ignore error from aborting socket
          server.close(() => {
            resolve();
          });
        });

        setTimeout(() => {
          req.destroy();
          server.close(() => {
            reject(new Error('SSE connection timed out waiting for data frames'));
          });
        }, 5000);
      });

      expect(responseHeaders).toBeDefined();
      expect(responseHeaders['content-type']).toContain('text/event-stream');
      
      // Verify snapshot frame content
      expect(responseText).toContain('event: snapshot');
      expect(responseText).toContain('progress.pdf');

      // Verify update frame content with payload enrichment from cache
      expect(responseText).toContain('event: update');
      expect(responseText).toContain('extracting');
      expect(responseText).toContain('progress.pdf');
      expect(responseText).toContain('"fileSizeBytes":100');
    });
  });

  describe('Cleanup Job: Orphan Record Management', () => {
    it('should expire pending uploads older than 30 minutes', async () => {
      const docId = crypto.randomUUID();
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);

      // We bypass prisma update constraints for created_at by using create override
      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'expired.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'pending_upload',
          created_at: thirtyFiveMinutesAgo,
        },
      });
      await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'pending_upload',
          created_at: thirtyFiveMinutesAgo,
        },
      });

      // Run cleanup
      await runCleanupJob();

      const doc = await prisma.document.findUnique({
        where: { id: docId },
        include: { processing_job: true },
      });
      expect(doc?.status).toBe('expired');
      expect(doc?.processing_job?.status).toBe('expired');
    });

    it('should mark stuck uploads older than 10 minutes as failed with sqs_delivery_failure', async () => {
      const docId = crypto.randomUUID();
      const twelveMinutesAgo = new Date(Date.now() - 12 * 60 * 1000);

      await prisma.document.create({
        data: {
          id: docId,
          session_id: sessionId,
          filename: 'stuck.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: 100,
          s3_key: `sessions/${sessionId}/documents/${docId}/original`,
          status: 'uploaded',
          created_at: twelveMinutesAgo,
          updated_at: twelveMinutesAgo,
        },
      });
      await prisma.processingJob.create({
        data: {
          document_id: docId,
          session_id: sessionId,
          status: 'uploaded',
          created_at: twelveMinutesAgo,
          updated_at: twelveMinutesAgo,
        },
      });

      // Run cleanup
      await runCleanupJob();

      const doc = await prisma.document.findUnique({
        where: { id: docId },
        include: { processing_job: true },
      });
      expect(doc?.status).toBe('failed');
      expect(doc?.processing_job?.status).toBe('failed');
      expect(doc?.processing_job?.error_code).toBe('sqs_delivery_failure');
    });
  });
});

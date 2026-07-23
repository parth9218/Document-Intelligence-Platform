import request from 'supertest';
import app from '../app';
import { prisma } from '../db';
import { sign } from '../middlewares/session';
import crypto from 'crypto';
import { getEmbeddingProvider } from '../services/embedding.service';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-key-change-in-production-12345';
const COOKIE_NAME = 'session_token';

describe('Vector Similarity Search & Tenancy Enforcement API Tests (Task 301)', () => {
  let sessionAId: string;
  let sessionAToken: string;
  let authCookieA: string;

  let sessionBId: string;
  let sessionBToken: string;
  let authCookieB: string;

  let documentAId: string;
  let documentBId: string;

  beforeAll(async () => {
    // Clean database tables
    await prisma.$executeRaw`DELETE FROM document_chunks;`;
    await prisma.processingJob.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.session.deleteMany({});

    // Create Session A
    const tokenARaw = crypto.randomBytes(32).toString('hex');
    sessionAToken = sign(tokenARaw, SESSION_SECRET);
    authCookieA = `${COOKIE_NAME}=${encodeURIComponent(sessionAToken)}`;

    const sessionA = await prisma.session.create({
      data: {
        session_token: sessionAToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionAId = sessionA.id;

    // Create Session B
    const tokenBRaw = crypto.randomBytes(32).toString('hex');
    sessionBToken = sign(tokenBRaw, SESSION_SECRET);
    authCookieB = `${COOKIE_NAME}=${encodeURIComponent(sessionBToken)}`;

    const sessionB = await prisma.session.create({
      data: {
        session_token: sessionBToken,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    sessionBId = sessionB.id;

    // Create Document for Session A
    const docA = await prisma.document.create({
      data: {
        session_id: sessionAId,
        filename: 'report_a.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: BigInt(2048),
        s3_key: `sessions/${sessionAId}/documents/doc_a/original`,
        status: 'completed',
      },
    });
    documentAId = docA.id;

    // Create Document for Session B
    const docB = await prisma.document.create({
      data: {
        session_id: sessionBId,
        filename: 'secret_b.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: BigInt(4096),
        s3_key: `sessions/${sessionBId}/documents/doc_b/original`,
        status: 'completed',
      },
    });
    documentBId = docB.id;

    // Generate deterministic vectors using local provider to match test query calls
    const localProvider = getEmbeddingProvider('local');
    const vecA1 = await localProvider.embedQuery('Architecture specifications');
    const vecA1Str = `[${vecA1.join(',')}]`;

    const vecA2 = await localProvider.embedQuery('Database schema design');
    const vecA2Str = `[${vecA2.join(',')}]`;

    const vecB1 = await localProvider.embedQuery('Project roadmap');
    const vecB1Str = `[${vecB1.join(',')}]`;

    // Distant vector (> 0.5 distance away)
    const vecDistant = new Array(1024).fill(0);
    vecDistant[500] = 1.0;
    const vecDistantStr = `[${vecDistant.join(',')}]`;

    // Seed Session A Chunks
    await prisma.$executeRaw`
      INSERT INTO document_chunks (id, document_id, session_id, chunk_index, page_number, content, embedding, model_version)
      VALUES 
      (gen_random_uuid(), ${documentAId}::uuid, ${sessionAId}::uuid, 0, 1, 'Session A Chunk 1 - Architecture specifications', ${vecA1Str}::vector, 'titan-embed-text-v2'),
      (gen_random_uuid(), ${documentAId}::uuid, ${sessionAId}::uuid, 1, 2, 'Session A Chunk 2 - Database schema design', ${vecA2Str}::vector, 'titan-embed-text-v2'),
      (gen_random_uuid(), ${documentAId}::uuid, ${sessionAId}::uuid, 2, 3, 'Session A Chunk 3 - Distant irrelevant content', ${vecDistantStr}::vector, 'titan-embed-text-v2');
    `;

    // Seed Session B Chunks
    await prisma.$executeRaw`
      INSERT INTO document_chunks (id, document_id, session_id, chunk_index, page_number, content, embedding, model_version)
      VALUES 
      (gen_random_uuid(), ${documentBId}::uuid, ${sessionBId}::uuid, 0, 1, 'Session B Confidential Data - Project roadmap', ${vecB1Str}::vector, 'titan-embed-text-v2');
    `;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM document_chunks;`;
    await prisma.processingJob.deleteMany({});
    await prisma.document.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Embedding Provider Factory & Provider Modes', () => {
    it('should resolve LocalEmbeddingProvider when EMBEDDING_PROVIDER=local', async () => {
      const provider = getEmbeddingProvider('local');
      const vector = await provider.embedQuery('test search query');
      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(1024);
    });

    it('should resolve BedrockEmbeddingProvider when EMBEDDING_PROVIDER=bedrock', () => {
      const provider = getEmbeddingProvider('bedrock');
      expect(provider).toBeDefined();
    });

    it('should throw UnsupportedEmbeddingProviderError for invalid/unsupported provider name', () => {
      expect(() => getEmbeddingProvider('unsupported_foo')).toThrow('Unsupported embedding provider: \'unsupported_foo\'');
    });
  });

  describe('POST /api/query/search Contract & Tenancy Enforcement', () => {
    it('should return 401 Unauthorized if session token signature is tampered', async () => {
      const tamperedCookie = `${COOKIE_NAME}=${encodeURIComponent(sessionAToken + 'tampered')}`;
      const res = await request(app)
        .post('/api/query/search')
        .set('Cookie', [tamperedCookie])
        .send({ query: 'architecture' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid session signature');
    });

    it('should return 400 Bad Request if query request body parameter is missing or empty', async () => {
      const res = await request(app)
        .post('/api/query/search')
        .set('Cookie', [authCookieA])
        .send({ query: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_query');
    });

    it('should execute similarity search for Session A via request body and enforce tenancy isolation', async () => {
      const res = await request(app)
        .post('/api/query/search')
        .set('Cookie', [authCookieA])
        .send({ query: 'Architecture specifications' });

      expect(res.status).toBe(200);
      expect(res.body.query).toBe('Architecture specifications');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);

      // Verify strict tenancy isolation: NO chunks from Session B!
      for (const result of res.body.results) {
        expect(result.filename).toBe('report_a.pdf');
        expect(result.content).not.toContain('Session B Confidential Data');
      }

      // Verify distance threshold filtering (distance <= 0.5)
      for (const result of res.body.results) {
        expect(result.distance).toBeLessThanOrEqual(0.5);
      }
    });

    it('should isolate Session B queries and prevent leaking Session A data', async () => {
      const res = await request(app)
        .post('/api/query/search')
        .set('Cookie', [authCookieB])
        .send({ query: 'Project roadmap' });

      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);

      // Verify results strictly belong to Session B
      for (const result of res.body.results) {
        expect(result.filename).toBe('secret_b.pdf');
        expect(result.content).toContain('Session B Confidential Data');
        expect(result.content).not.toContain('Session A');
      }
    });

    it('should support streaming response contract when Accept is text/event-stream or body stream is true', async () => {
      const res = await request(app)
        .post('/api/query/search')
        .set('Cookie', [authCookieA])
        .set('Accept', 'text/event-stream')
        .send({ query: 'Architecture specifications', stream: true });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.text).toContain('event: context');
      expect(res.text).toContain('event: token');
      expect(res.text).toContain('event: done');
    });
  });
});

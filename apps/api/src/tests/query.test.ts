import request from 'supertest';
import app from '../app';
import { prisma } from '../db';
import { sign } from '../middlewares/session';
import crypto from 'crypto';
import { getEmbeddingProvider } from '../services/embedding.service';
import { getLlmProvider, CitationValidator, buildPrompt } from '../services/llm.service';
import type { SearchResultChunk } from '../services/search.service';

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
      expect(res.text).toContain('event: citation');
      expect(res.text).toContain('event: done');

      // Verify citation frame has correct shape (filename + pageNumber)
      const citationMatch = res.text.match(/event: citation\ndata: (\{.*?\})/);
      expect(citationMatch).not.toBeNull();
      const citationData = JSON.parse(citationMatch![1]);
      expect(citationData).toHaveProperty('index');
      expect(citationData).toHaveProperty('filename');
      expect(citationData).toHaveProperty('pageNumber');
    });
  });
});

// ---------------------------------------------------------------------------
// Task 302: Grounded Generation, SSE Streaming & Citations
// ---------------------------------------------------------------------------

describe('LLM Provider & Citation Validation Tests (Task 302)', () => {
  describe('LLM Provider Factory', () => {
    it('should resolve LocalLlmProvider for provider=local', () => {
      const provider = getLlmProvider('local');
      expect(provider).toBeDefined();
    });

    it('should resolve BedrockLlmProvider for provider=bedrock', () => {
      const provider = getLlmProvider('bedrock');
      expect(provider).toBeDefined();
    });

    it('should throw UnsupportedLlmProviderError for unrecognised provider', () => {
      expect(() => getLlmProvider('openai')).toThrow("Unsupported LLM provider: 'openai'");
    });
  });

  describe('buildPrompt', () => {
    const mockChunks: SearchResultChunk[] = [
      { id: 'c1', documentId: 'd1', content: 'Architecture overview content.', pageNumber: 1, distance: 0.1, filename: 'design.pdf' },
      { id: 'c2', documentId: 'd2', content: 'Database schema details.', pageNumber: 5, distance: 0.2, filename: 'schema.pdf' },
    ];

    it('should label each chunk with sequential bracket index', () => {
      const { userMessage } = buildPrompt('What is the architecture?', mockChunks);
      expect(userMessage).toContain('[1]');
      expect(userMessage).toContain('[2]');
      expect(userMessage).toContain('design.pdf');
      expect(userMessage).toContain('schema.pdf');
    });

    it('should include the user query in the user message', () => {
      const { userMessage } = buildPrompt('What is the architecture?', mockChunks);
      expect(userMessage).toContain('What is the architecture?');
    });

    it('should instruct the model to cite sources in the system prompt', () => {
      const { systemPrompt } = buildPrompt('Any question', mockChunks);
      expect(systemPrompt.toLowerCase()).toContain('cite');
      expect(systemPrompt.toLowerCase()).toContain('context');
    });
  });

  describe('CitationValidator', () => {
    const mockChunks: SearchResultChunk[] = [
      { id: 'c1', documentId: 'd1', content: 'chunk 1', pageNumber: 2, distance: 0.1, filename: 'report.pdf' },
      { id: 'c2', documentId: 'd2', content: 'chunk 2', pageNumber: 7, distance: 0.2, filename: 'design.pdf' },
    ];

    it('should extract a valid citation and return its metadata', () => {
      const validator = new CitationValidator(mockChunks);
      const { cleanToken, newCitations } = validator.extractAndValidate('According to [1] this is true.');
      expect(cleanToken).toContain('[1]');
      expect(newCitations).toHaveLength(1);
      expect(newCitations[0]).toMatchObject({ index: 1, filename: 'report.pdf', pageNumber: 2 });
    });

    it('should extract multiple citations from a single token', () => {
      const validator = new CitationValidator(mockChunks);
      const { newCitations } = validator.extractAndValidate('[1] says one thing and [2] says another.');
      expect(newCitations).toHaveLength(2);
      expect(newCitations.map((c) => c.index)).toEqual([1, 2]);
    });

    it('should strip hallucinated citation indexes beyond chunk count', () => {
      const validator = new CitationValidator(mockChunks);
      const { cleanToken, newCitations } = validator.extractAndValidate('As stated in [99] some claim.');
      expect(cleanToken).not.toContain('[99]');
      expect(newCitations).toHaveLength(0);
    });

    it('should strip zero-index hallucinated citation', () => {
      const validator = new CitationValidator(mockChunks);
      const { cleanToken, newCitations } = validator.extractAndValidate('Claim [0] is invalid.');
      expect(cleanToken).not.toContain('[0]');
      expect(newCitations).toHaveLength(0);
    });

    it('should deduplicate citations emitted in previous calls', () => {
      const validator = new CitationValidator(mockChunks);
      validator.extractAndValidate('First mention [1].');
      const { newCitations } = validator.extractAndValidate('Second mention [1] again.');
      expect(newCitations).toHaveLength(0);
    });

    it('should pass through token text with valid citations unchanged', () => {
      const validator = new CitationValidator(mockChunks);
      const { cleanToken } = validator.extractAndValidate('Text with [1] reference.');
      expect(cleanToken).toBe('Text with [1] reference.');
    });
  });
});

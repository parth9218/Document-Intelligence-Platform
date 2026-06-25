import request from 'supertest';
import { prisma } from '../db';

/**
 * CORS Configuration Integration Tests (Task 108 / ADR-018)
 *
 * Verifies that the Express API applies the correct Cross-Origin Resource
 * Sharing policy in every environment:
 *
 *  - Development/test: any requesting Origin is reflected back (dynamic mirror).
 *  - Production: only the CORS_ALLOWED_ORIGIN is accepted; all others are blocked.
 *  - Wildcard '*' is never returned when credentials are enabled.
 *  - Preflight OPTIONS requests are served with the correct headers and Max-Age.
 *  - Access-Control-Allow-Credentials is always 'true'.
 */

describe('CORS Middleware Tests (ADR-018)', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAllowedOrigin = process.env.CORS_ALLOWED_ORIGIN;

  // Re-import app fresh per test so environment changes take effect.
  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    process.env.CORS_ALLOWED_ORIGIN = originalAllowedOrigin;
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // Development / Test environment
  // ---------------------------------------------------------------------------

  describe('Development mode (NODE_ENV=development)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      delete process.env.CORS_ALLOWED_ORIGIN;
    });

    it('should reflect any requesting Origin in Access-Control-Allow-Origin', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3001');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('should set Access-Control-Allow-Credentials to true', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3001');

      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should NEVER return wildcard * as Access-Control-Allow-Origin', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://any-site.com');

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('should respond to preflight OPTIONS with 204 and correct CORS headers', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-max-age']).toBe('86400');
    });

    it('should list all required HTTP methods in preflight Allow-Methods', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3001')
        .set('Access-Control-Request-Method', 'DELETE');

      const methods = res.headers['access-control-allow-methods'] as string;
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('OPTIONS');
    });

    it('should pass through requests with no Origin header (same-origin / curl)', async () => {
      const app = require('../app').default;

      const res = await request(app).get('/health');

      // No ACAO header expected for requests without Origin.
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Production environment
  // ---------------------------------------------------------------------------

  describe('Production mode (NODE_ENV=production)', () => {
    const ALLOWED_ORIGIN = 'https://docintel.example.com';

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGIN = ALLOWED_ORIGIN;
      // Provide required production env vars so config validation does not throw.
      process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.CORS_ALLOWED_ORIGIN = originalAllowedOrigin;
    });

    it('should allow requests from the configured CORS_ALLOWED_ORIGIN', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .get('/health')
        .set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should block requests from an unlisted origin (no ACAO header returned)', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://untrusted-site.com');

      // When an origin is blocked the cors package omits the ACAO header entirely.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should NEVER return wildcard * in production', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .get('/health')
        .set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('should respond to a valid-origin preflight OPTIONS with 204 and Max-Age 86400', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .options('/health')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-max-age']).toBe('86400');
    });

    it('should respond to a blocked-origin preflight with no ACAO header', async () => {
      const app = require('../app').default;

      const res = await request(app)
        .options('/health')
        .set('Origin', 'http://evil.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

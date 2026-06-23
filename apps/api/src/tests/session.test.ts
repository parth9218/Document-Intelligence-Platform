import request from 'supertest';
import express from 'express';
import app from '../app';
import { prisma } from '../db';
import { sign, sessionMiddleware } from '../middlewares/session';
import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-key-change-in-production-12345';
const COOKIE_NAME = 'session_token';

describe('API Session Management & Middleware Integration Tests', () => {
  let createdSessionIds: string[] = [];

  // Helper to sign a token in tests
  function createSignedCookie(token: string): string {
    const signed = sign(token, SESSION_SECRET);
    return `${COOKIE_NAME}=${encodeURIComponent(signed)}`;
  }

  // Cleanup sessions created during tests
  afterAll(async () => {
    const idsToDelete = createdSessionIds.filter((id): id is string => typeof id === 'string' && id !== '');
    if (idsToDelete.length > 0) {
      await prisma.session.deleteMany({
        where: {
          id: {
            in: idsToDelete,
          },
        },
      });
    }
    await prisma.$disconnect();
  });

  describe('Health Check Route (No Middleware)', () => {
    it('should return status ok and should NOT set a session cookie', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('Session Middleware Standalone Isolation', () => {
    it('should auto-generate a new session in the database and set a cookie when no cookie is present', async () => {
      // Create an isolated Express application mounting only the session middleware
      const testApp = express();
      testApp.use(sessionMiddleware);
      testApp.get('/test-middleware', (req, res) => {
        res.json({
          session_id: req.session?.id,
          session_token: req.session?.session_token,
        });
      });

      const response = await request(testApp).get('/test-middleware');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session_id');
      expect(response.body).toHaveProperty('session_token');
      
      const sessionId = response.body.session_id;
      createdSessionIds.push(sessionId);

      // Verify Set-Cookie header contains session_token matching the DB record
      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader[0]).toContain(`${COOKIE_NAME}=`);

      // Verify database row exists
      const dbSession = await prisma.session.findUnique({
        where: { id: sessionId },
      });
      expect(dbSession).toBeDefined();
      expect(dbSession?.session_token).toBe(response.body.session_token);
    });
  });

  describe('Session Route Integrations', () => {
    it('should authenticate and slide the session expiration if a valid cookie is present', async () => {
      // 1. Establish a new session first
      const failedRouteResponse = await request(app).get('/failed_route').catch(() => {});
      const setCookieHeader = failedRouteResponse?.headers['set-cookie']?.[0];
      expect(setCookieHeader).toBeDefined();
      const cookieValue = setCookieHeader!.split(';')[0].split('=')[1];

      const sessionResponse = await request(app)
        .get('/api/session')
        .set('Cookie', `${COOKIE_NAME}=${cookieValue}`);

      const sessionId = sessionResponse.body.id;
      if (sessionId) {
        createdSessionIds.push(sessionId);
      }

      const initialDbSession = await prisma.session.findUnique({
        where: { id: sessionId },
      });
      const initialExpires = initialDbSession!.expires_at.getTime();

      // Wait 100ms to allow timestamps to differ slightly
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 2. Request with the valid session cookie
      const authResponse = await request(app)
        .get('/api/session')
        .set('Cookie', `${COOKIE_NAME}=${cookieValue}`);

      expect(authResponse.status).toBe(200);
      expect(authResponse.body.id).toBe(sessionId);

      // 3. Verify the expiration was slided in the database
      const updatedDbSession = await prisma.session.findUnique({
        where: { id: sessionId },
      });
      const updatedExpires = updatedDbSession!.expires_at.getTime();
      expect(updatedExpires).toBeGreaterThan(initialExpires);

      // 4. Verify the response cookie also slides the expiration
      const resSetCookieHeader = authResponse.headers['set-cookie'];
      expect(resSetCookieHeader).toBeDefined();
      expect(resSetCookieHeader[0]).toContain(`${COOKIE_NAME}=${cookieValue}`);
    });

    it('should return 401 Unauthorized if the cookie signature is tampered/invalid', async () => {
      const validToken = crypto.randomBytes(32).toString('hex');
      const signedToken = sign(validToken, SESSION_SECRET);
      const tamperedCookie = `${signedToken}invalid`;

      const response = await request(app)
        .get('/api/session')
        .set('Cookie', `${COOKIE_NAME}=${encodeURIComponent(tamperedCookie)}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid session signature' });
    });

    it('should return 401 Unauthorized if the session is valid but not found in the database', async () => {
      const nonExistentToken = crypto.randomBytes(32).toString('hex');
      const signedCookie = createSignedCookie(nonExistentToken);

      const response = await request(app)
        .get('/api/session')
        .set('Cookie', signedCookie);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Session not found' });
    });

    it('should return 401 Unauthorized and clear the cookie if the session has expired', async () => {
      const expiredTokenRaw = crypto.randomBytes(32).toString('hex');
      const signedToken = sign(expiredTokenRaw, SESSION_SECRET);
      const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute in the past

      const expiredSession = await prisma.session.create({
        data: {
          session_token: signedToken,
          expires_at: pastDate,
        },
      });
      createdSessionIds.push(expiredSession.id);

      const response = await request(app)
        .get('/api/session')
        .set('Cookie', `${COOKIE_NAME}=${encodeURIComponent(signedToken)}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Session expired' });

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader[0]).toContain(`${COOKIE_NAME}=;`);
      expect(setCookieHeader[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });
  });
});

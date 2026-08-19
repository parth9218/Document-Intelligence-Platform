import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';
import { Session } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../errors/app-error';

// Extend Express Request interface to include session
declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

const SESSION_SECRET = config.sessionSecret;
const COOKIE_NAME = config.cookies.name;
const SESSION_EXPIRY_MS = config.cookies.maxAgeMs;

/**
 * Helper to sign a value with HMAC-SHA256
 */
export function sign(value: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/=+$/, '');
  return `${value}.${signature}`;
}

/**
 * Helper to verify and unsign a value
 */
export function unsign(input: string, secret: string): string | false {
  const parts = input.split('.');
  if (parts.length < 2) return false;
  const value = parts.slice(0, -1).join('.');
  const signature = parts[parts.length - 1];
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64')
    .replace(/=+$/, '');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);
  if (
    sigBuffer.length === expectedSigBuffer.length &&
    crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return value;
  }
  return false;
}

/**
 * Helper to extract a cookie from headers
 */
function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const parts = cookie.split('=');
    const cookieName = parts[0].trim();
    if (cookieName === name) {
      return parts.slice(1).join('=').trim();
    }
  }
  return undefined;
}

/**
 * Verifies the session cookie and returns 401 if invalid. Extends the expiration.
 */
async function verifyExtendAndReturn(cookieValue: string, req: Request, res: Response, next: NextFunction) {
  const unsignedToken = unsign(cookieValue, SESSION_SECRET);
  if (unsignedToken === false) {
    logger.warn('Session verification failed: invalid signature');
    return res.status(401).json({ error: 'Invalid session signature' });
  }

  try {
    // Look up the session in the database
    const session = await prisma.session.findUnique({
      where: { session_token: cookieValue },
    });

    if (!session) {
      logger.warn('Session verification failed: session not found in DB', { cookieValue });
      return res.status(401).json({ error: 'Session not found' });
    }

    // Check if session is expired
    if (new Date() > session.expires_at) {
      logger.info('Session expired, clearing cookie', { sessionId: session.id });
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'Session expired' });
    }

    // Sliding window: update expiration and activity timestamps
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
    const updatedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        last_active_at: new Date(),
        expires_at: expiresAt,
      },
    });

    // Re-issue cookie with sliding expiration
    res.cookie(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: config.nodeEnv !== 'local',
      sameSite: 'lax',
      expires: expiresAt,
    });

    req.session = updatedSession;
    return next();
  } catch (err) {
    logger.error('Session validation error:', err);
    return res.status(500).json({ error: 'Internal server error validating session' });
  }
}

/**
 * Middleware to fetch an existing session without creating one if absent
 */
export async function getSession(req: Request, res: Response, next: NextFunction) {
  const rawCookieValue = getCookie(req, COOKIE_NAME);
  const cookieValue = rawCookieValue ? decodeURIComponent(rawCookieValue) : undefined;
  if (!cookieValue) {
    return next();
  }
  return verifyExtendAndReturn(cookieValue, req, res, next);
}

/**
 * Middleware that validates or auto-creates a session cookie
 */
export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const rawCookieValue = getCookie(req, COOKIE_NAME);
  const cookieValue = rawCookieValue ? decodeURIComponent(rawCookieValue) : undefined;

  if (!cookieValue) {
    // Session cookie not present - create a new session
    try {
      const sessionTokenRaw = crypto.randomBytes(32).toString('hex');
      const signedToken = sign(sessionTokenRaw, SESSION_SECRET);
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

      const session = await prisma.session.create({
        data: {
          session_token: signedToken,
          expires_at: expiresAt,
          ip_address: req.ip || null,
          user_agent: req.headers['user-agent'] || null,
        },
      });

      res.cookie(COOKIE_NAME, signedToken, {
        httpOnly: true,
        secure: config.nodeEnv !== 'local',
        sameSite: 'lax',
        expires: expiresAt,
      });

      req.session = session;
      logger.info('Established new session', { sessionId: session.id });
      return next();
    } catch (err) {
      logger.error('Failed to create new session:', err);
      return res.status(500).json({ error: 'Internal server error establishing session' });
    }
  }

  // Session cookie is present - verify signature
  return verifyExtendAndReturn(cookieValue, req, res, next);
}

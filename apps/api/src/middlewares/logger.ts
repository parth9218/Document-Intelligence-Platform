import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    // Build structured metadata
    const meta: Record<string, any> = {
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent') || 'unknown',
    };

    // Attach session ID if available from the session middleware
    if ((req as any).session?.id) {
      meta.sessionId = (req as any).session.id;
    }

    const message = `[${method}] ${originalUrl} ${statusCode} - ${duration}ms`;

    // Log appropriately based on status code
    if (statusCode >= 500) {
      logger.error(message, undefined, meta);
    } else if (statusCode >= 400) {
      logger.warn(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
};

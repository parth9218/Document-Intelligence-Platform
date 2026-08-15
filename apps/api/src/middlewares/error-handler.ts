import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error';
import { logger } from '../utils/logger';
import { config } from '../config';

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    logger.warn(`AppError triggered: [${err.statusCode}] [${err.errorCode}] - ${err.message}`, {
      path: req.path,
      method: req.method,
      session_id: req.session?.id,
    });

    res.status(err.statusCode).json({
      error: err.errorCode,
      ...(err.errorCode !== err.message ? { message: err.message } : {}),
      // In case the caller expects both, or just a simple error code
      // We will ensure a clean mapping that matches existing endpoints
    });
    return;
  }

  // Unexpected server error
  logger.error(`Unhandled internal server error: ${err.message}`, err, {
    path: req.path,
    method: req.method,
    session_id: req.session?.id,
  });

  const responsePayload: any = {
    error: 'internal_server_error',
    message: 'An unexpected error occurred.',
  };

  if (config.nodeEnv === 'local') {
    responsePayload.stack = err.stack;
    responsePayload.details = err.message;
  }

  res.status(500).json(responsePayload);
};

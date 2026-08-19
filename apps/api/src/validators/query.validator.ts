import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors/app-error';

/**
 * Validates that request body property `query` is present and non-empty.
 */
export const validateQuerySearch = (req: Request, res: Response, next: NextFunction): void => {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new ValidationError(
      'Field "query" is required and must be a non-empty string.',
      'invalid_query'
    );
  }
  next();
};

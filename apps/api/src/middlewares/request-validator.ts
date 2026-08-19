import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors/app-error';

export type BodyValidator = (body: any) => { error?: string; errorCode?: string } | null;

/**
 * Express middleware to validate request body syntax using a validator function.
 */
export function validateRequestBody(validator: BodyValidator) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const validationResult = validator(req.body);
    
    if (validationResult && validationResult.error) {
      return next(
        new ValidationError(
          validationResult.error,
          validationResult.errorCode || 'invalid_request_body'
        )
      );
    }
    
    next();
  };
}

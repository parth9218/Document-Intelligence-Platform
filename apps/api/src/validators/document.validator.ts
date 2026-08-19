import { BodyValidator } from '../middlewares/request-validator';

/**
 * Validates the body of POST /api/documents initialization requests
 */
export const validateBatchUploadInit: BodyValidator = (body: any) => {
  if (!body || typeof body !== 'object') {
    return {
      error: 'Request body must be a JSON object.',
      errorCode: 'invalid_request_body',
    };
  }

  const { documents } = body;
  if (!Array.isArray(documents)) {
    return {
      error: 'Request body must contain a documents array.',
      errorCode: 'invalid_request_body',
    };
  }

  return null;
};

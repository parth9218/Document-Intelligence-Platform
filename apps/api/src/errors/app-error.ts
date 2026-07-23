export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errorCode: string = 'validation_error') {
    super(400, errorCode, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access', errorCode: string = 'unauthorized') {
    super(401, errorCode, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden', errorCode: string = 'forbidden') {
    super(403, errorCode, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', errorCode: string = 'not_found') {
    super(404, errorCode, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, errorCode: string = 'conflict') {
    super(409, errorCode, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, errorCode: string = 'rate_limit_exceeded') {
    super(429, errorCode, message);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'An unexpected error occurred', errorCode: string = 'internal_server_error') {
    super(500, errorCode, message);
  }
}

export class UnsupportedEmbeddingProviderError extends AppError {
  constructor(provider: string) {
    super(400, 'unsupported_embedding_provider', `Unsupported embedding provider: '${provider}'. Supported providers are 'bedrock' and 'local'.`);
  }
}

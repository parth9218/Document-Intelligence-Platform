import { apiRouting } from '../config/api-routing';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Returns the resolved URL for an endpoint depending on its routing mode.
 * If in 'api' mode, it maps to the backend API URL.
 * If in 'mock' mode, it maps to the relative path so MSW intercepts it.
 */
export function getEndpointUrl(endpoint: keyof typeof apiRouting, path: string): string {
  const mode = apiRouting[endpoint];
  if (mode === 'api') {
    return `${BACKEND_URL}${path}`;
  }
  // For mock mode, keep relative so MSW running on the same host intercepts it cleanly
  return path;
}

export class ApiError extends Error {
  status: number;
  errorKey: string;
  details?: string;
  
  constructor(status: number, errorKey: string, message: string, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorKey = errorKey;
    this.details = details;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized access', details?: string) {
    super(401, 'unauthorized', message, details);
    this.name = 'UnauthorizedError';
  }
}

export class StorageQuotaExceededError extends ApiError {
  constructor(message = 'Storage quota exceeded', details?: string) {
    super(400, 'storage_quota_exceeded', message, details);
    this.name = 'StorageQuotaExceededError';
  }
}

export class RateLimitExceededError extends ApiError {
  constructor(message = 'Rate limit exceeded', details?: string) {
    super(429, 'rate_limit_exceeded', message, details);
    this.name = 'RateLimitExceededError';
  }
}

export class ConcurrencyLimitExceededError extends ApiError {
  constructor(message = 'Concurrency limit exceeded', details?: string) {
    super(429, 'concurrency_limit_exceeded', message, details);
    this.name = 'ConcurrencyLimitExceededError';
  }
}

export async function apiClient<T>(
  endpoint: keyof typeof apiRouting,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = getEndpointUrl(endpoint, path);
  
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Ensure cookies are passed
  });

  if (!response.ok) {
    let errorKey = 'unknown_error';
    let errorMessage = 'An unexpected error occurred';
    let errorDetails: string | undefined;
    
    try {
      const data = await response.json();
      if (data.error) errorKey = data.error;
      if (data.message) errorMessage = data.message;
      if (data.details) errorDetails = data.details;
    } catch {
      errorMessage = response.statusText;
    }
    
    // Intercept specific status codes / error keys to throw specialized errors
    if (response.status === 401 || errorKey === 'unauthorized') {
      throw new UnauthorizedError(errorMessage, errorDetails);
    }
    if (errorKey === 'storage_quota_exceeded') {
      throw new StorageQuotaExceededError(errorMessage, errorDetails);
    }
    if (errorKey === 'concurrency_limit_exceeded') {
      throw new ConcurrencyLimitExceededError(errorMessage, errorDetails);
    }
    if (response.status === 429 || errorKey === 'rate_limit_exceeded') {
      throw new RateLimitExceededError(errorMessage, errorDetails);
    }
    
    throw new ApiError(response.status, errorKey, errorMessage, errorDetails);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

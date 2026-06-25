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
  
  constructor(status: number, errorKey: string, message: string) {
    super(message);
    super.name = 'ApiError';
    this.status = status;
    this.errorKey = errorKey;
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
    
    try {
      const data = await response.json();
      if (data.error) errorKey = data.error;
      if (data.message) errorMessage = data.message;
    } catch {
      errorMessage = response.statusText;
    }
    
    throw new ApiError(response.status, errorKey, errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

import { Signer } from '@aws-sdk/rds-signer';
import { config } from '../config';
import { logger } from './logger';

export interface RdsTokenOptions {
  hostname?: string;
  port?: number;
  username?: string;
  region?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

// In-memory cache for RDS IAM auth token (RDS tokens expire in 15 minutes; cache for 10 minutes)
let cachedToken: CachedToken | null = null;
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Generates or retrieves a valid RDS IAM authentication token.
 * Uses `@aws-sdk/rds-signer` with default SDK credential provider chain (IRSA in EKS).
 */
export async function getRdsIamAuthToken(options: RdsTokenOptions = {}): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const hostname = options.hostname || config.db.host;
  const port = options.port || config.db.port;
  const username = options.username || config.db.user;
  const region = options.region || config.aws.region;

  try {
    const signer = new Signer({
      hostname,
      port,
      username,
      region,
    });

    const token = await signer.getAuthToken();

    cachedToken = {
      token,
      expiresAt: now + TOKEN_CACHE_TTL_MS,
    };

    logger.info(`Generated fresh RDS IAM Auth token for ${username}@${hostname}:${port}`);
    return token;
  } catch (error) {
    logger.error('Failed to generate RDS IAM database authentication token:', error);
    throw error;
  }
}

/**
 * Clears the in-memory RDS token cache (useful for testing).
 */
export function clearRdsTokenCache(): void {
  cachedToken = null;
}

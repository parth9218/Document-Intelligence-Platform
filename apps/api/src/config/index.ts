import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-key-change-in-production-12345',
  
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock',
    s3Bucket: process.env.S3_BUCKET || 'documents-bucket',
    endpointUrl: process.env.AWS_ENDPOINT_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:4566'),
  },

  limits: {
    // Max file upload size: 5 MB (5,242,880 bytes)
    fileSizeMinBytes: 1,
    fileSizeMaxBytes: 5242880,
    
    // Cumulative storage limit: 50 MB (52,428,800 bytes)
    storageQuotaMaxBytes: 52428800,
    
    // Maximum active uploads/processing files per session: 5
    concurrencyMaxJobs: 5,
    
    // Presigned post TTL: 5 minutes (300 seconds)
    presignedPostExpiresSeconds: 300,
  },

  cleanup: {
    // Expire uploads that are never uploaded after 30 minutes
    expireNeverUploadedTimeoutMs: 30 * 60 * 1000,
    
    // Fail uploads stuck in 'uploaded' after 10 minutes (SQS delivery failure)
    failStuckUploadsTimeoutMs: 10 * 60 * 1000,
    
    // Cleanup polling interval: 5 minutes
    intervalMs: 5 * 60 * 1000,
  },

  cookies: {
    name: 'session_token',
    // 24 hours sliding window expiration
    maxAgeMs: 24 * 60 * 60 * 1000,
  },

  cors: {
    // Production: the exact frontend origin allowed to make credentialed requests.
    // In development/test the request Origin is reflected dynamically — this value is ignored.
    allowedOrigin: process.env.CORS_ALLOWED_ORIGIN || '',
  },
  similarity: {
    topK: parseInt(process.env.TOP_K || '5', 10),
    distanceThreshold: parseFloat(process.env.SIMILARITY_DISTANCE_THRESHOLD || '0.5'),
  },
  embeddings: {
    // Provider selection: 'bedrock' (AWS Bedrock Titan V2) or 'local' (Local model via @xenova/transformers)
    provider: process.env.EMBEDDING_PROVIDER || 'bedrock',
    // Single EMBEDDING_MODEL variable used by the active provider
    model: process.env.EMBEDDING_MODEL || (process.env.EMBEDDING_PROVIDER === 'local' ? 'Xenova/e5-large-v2' : 'amazon.titan-embed-text-v2:0'),
  },
};

// Simple configuration validation
if (config.nodeEnv === 'production') {
  if (!process.env.DATABASE_URL) {
    throw new Error('Production environment must define DATABASE_URL');
  }
  if (config.sessionSecret === 'dev-session-secret-key-change-in-production-12345') {
    console.warn('[Warning] Running in production with default SESSION_SECRET');
  }
  if (!config.cors.allowedOrigin) {
    console.warn('[Warning] Running in production without CORS_ALLOWED_ORIGIN — all cross-origin requests will be blocked');
  }
}

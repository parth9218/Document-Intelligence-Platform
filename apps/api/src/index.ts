import { config } from './config';
import app from './app';
import { startCleanupJob } from './jobs/cleanup';
import { logger } from './utils/logger';

const PORT = config.port;

// Simple configuration validation
if (config.nodeEnv !== 'local') {
  if (!config.db.databaseUrl && !config.db.iamAuthEnabled) {
    throw new Error('Production environment must define DATABASE_URL or DB_IAM_AUTH_ENABLED to true');
  }
  if (config.sessionSecret === 'dev-session-secret-key-change-in-production-12345') {
    console.warn('[Warning] Running in production with default SESSION_SECRET');
  }
  if (!config.cors.allowedOrigin) {
    console.warn('[Warning] Running in production without CORS_ALLOWED_ORIGIN — all cross-origin requests will be blocked');
  }
}

// Start database orphan cleanup timer
const cleanupInterval = startCleanupJob();

const server = app.listen(PORT, () => {
  logger.info(`API Server is running on port ${PORT} in [${config.nodeEnv}] mode`);
});

// Handle graceful shutdown on process termination
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server...');
  clearInterval(cleanupInterval);
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

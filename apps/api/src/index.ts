import { config } from './config';
import app from './app';
import { startCleanupJob } from './jobs/cleanup';
import { logger } from './utils/logger';

const PORT = config.port;

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

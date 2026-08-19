import { cleanupService } from '../services/cleanup.service';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Runs the database cleanups and handles errors
 */
export async function runCleanupJob() {
  logger.info('[Cleanup] Triggering scheduled orphan record cleanup...');
  await cleanupService.runOrphanCleanup();
}

/**
 * Starts the cleanup timer executing every 5 minutes (default)
 */
export function startCleanupJob(intervalMs = config.cleanup.intervalMs) {
  // Execute initial cleanup run immediately on server startup
  runCleanupJob().catch((err) => {
    logger.error('[Cleanup] Initial job execution failed:', err);
  });

  const intervalId = setInterval(() => {
    runCleanupJob().catch((err) => {
      logger.error('[Cleanup] Job execution failed:', err);
    });
  }, intervalMs);

  return intervalId;
}

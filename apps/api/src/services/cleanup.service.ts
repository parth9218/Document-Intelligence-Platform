import { prisma } from '../db';
import { config } from '../config';
import { logger } from '../utils/logger';

class CleanupService {
  /**
   * Scans database tables and performs orphan cleanup updates.
   */
  public async runOrphanCleanup(): Promise<void> {
    const now = new Date();

    // Type 1 — expired (never uploaded): pending_upload & created_at < 30 mins
    const expireThreshold = new Date(now.getTime() - config.cleanup.expireNeverUploadedTimeoutMs);
    try {
      const expiredJobs = await prisma.processingJob.findMany({
        where: {
          status: 'pending_upload',
          created_at: { lt: expireThreshold },
        },
        select: { document_id: true },
      });

      if (expiredJobs.length > 0) {
        const docIds = expiredJobs.map((j) => j.document_id);
        
        await prisma.$transaction([
          prisma.document.updateMany({
            where: { id: { in: docIds } },
            data: { status: 'expired' },
          }),
          prisma.processingJob.updateMany({
            where: { document_id: { in: docIds } },
            data: { status: 'expired' },
          }),
        ]);
        logger.info(`[Cleanup] Marked ${docIds.length} expired (never uploaded) documents`);
      }
    } catch (err) {
      logger.error('[Cleanup] Error running expired document cleanup:', err);
    }

    // Type 2 — stuck uploaded (SQS delivery confirmation timed out): uploaded & updated_at < 10 mins
    const stuckThreshold = new Date(now.getTime() - config.cleanup.failStuckUploadsTimeoutMs);
    try {
      const stuckJobs = await prisma.processingJob.findMany({
        where: {
          status: 'uploaded',
          updated_at: { lt: stuckThreshold },
        },
        select: { document_id: true },
      });

      if (stuckJobs.length > 0) {
        const docIds = stuckJobs.map((j) => j.document_id);

        await prisma.$transaction([
          prisma.document.updateMany({
            where: { id: { in: docIds } },
            data: { status: 'failed' },
          }),
          prisma.processingJob.updateMany({
            where: { document_id: { in: docIds } },
            data: {
              status: 'failed',
              error_code: 'sqs_delivery_failure',
              error_message: 'SQS delivery confirmation timed out. Processing failed to start.',
            },
          }),
        ]);
        logger.info(`[Cleanup] Marked ${docIds.length} stuck uploaded documents as failed`);
      }
    } catch (err) {
      logger.error('[Cleanup] Error running stuck uploaded document cleanup:', err);
    }
  }
}

export const cleanupService = new CleanupService();

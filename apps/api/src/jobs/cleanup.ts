import { prisma } from '../db';

export async function runCleanupJob() {
  const now = new Date();

  // Type 1 — expired (never uploaded): pending_upload and created_at < 30 min ago
  const expireThreshold = new Date(now.getTime() - 30 * 60 * 1000);
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
      console.log(`[Cleanup] Successfully marked ${docIds.length} expired (never uploaded) documents`);
    }
  } catch (err) {
    console.error('[Cleanup] Error running expired document cleanup:', err);
  }

  // Type 2 — stuck uploaded (SQS event never arrived): uploaded and updated_at < 10 min ago
  const stuckThreshold = new Date(now.getTime() - 10 * 60 * 1000);
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
      console.log(`[Cleanup] Successfully marked ${docIds.length} stuck uploaded documents as failed`);
    }
  } catch (err) {
    console.error('[Cleanup] Error running stuck uploaded document cleanup:', err);
  }
}

export function startCleanupJob(intervalMs = 5 * 60 * 1000) {
  // Execute initial cleanup run immediately on startup
  runCleanupJob().catch((err) => {
    console.error('[Cleanup] Initial job execution failed:', err);
  });

  const intervalId = setInterval(() => {
    runCleanupJob().catch((err) => {
      console.error('[Cleanup] Job execution failed:', err);
    });
  }, intervalMs);

  return intervalId;
}

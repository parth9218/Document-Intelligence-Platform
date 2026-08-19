import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/document.service';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../errors/app-error';

class DocumentController {
  /**
   * Orchestrates the batch initialization request body.
   */
  public async initializeUploads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const results = await documentService.initializeUploadBatch(req.session.id, req.body.documents);
      res.status(200).json({ results });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handles confirming file upload completeness.
   */
  public async confirmUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const documentId = req.params.id;
      await documentService.confirmUpload(req.session.id, documentId);
      
      res.status(200).json({ status: 'uploaded' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handles returning polling statuses for all documents in the session.
   */
  public async getSessionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const statusDetails = await documentService.getSessionDocumentsStatus(req.session.id);
      res.status(200).json(statusDetails);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handles SSE progress streaming connection configuration for the session.
   */
  public async getProgressStream(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const sessionId = req.session.id;

      // Connect progress stream logic via service
      const { snapshot, metadataCache, cleanup } = await documentService.connectProgressStream(
        sessionId,
        (payload) => {
          const documentId = payload.document_id;
          const meta = metadataCache.get(documentId) || {
            filename: 'unknown',
            mimeType: 'application/octet-stream',
            fileSizeBytes: 0,
            createdAt: new Date(),
          };

          const enrichedPayload = {
            documentId,
            filename: meta.filename,
            mimeType: meta.mimeType,
            fileSizeBytes: meta.fileSizeBytes,
            status: payload.status,
            progressPct: payload.progress_pct,
            processedChunks: payload.processed_chunks,
            totalChunks: payload.total_chunks,
            errorCode: payload.error_code,
            errorMessage: payload.error_message,
            createdAt: meta.createdAt,
          };

          // Write progress notifications as named 'update' SSE event frames
          res.write(`event: update\ndata: ${JSON.stringify(enrichedPayload)}\n\n`);
        }
      );

      // Write SSE stream headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Push initial snapshot data frame immediately on connect
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      // Hook cleanup to closed connection event
      req.on('close', async () => {
        logger.info('SSE Client disconnected, executing stream cleanup', { sessionId });
        await cleanup();
      });
    } catch (err) {
      // Forward to error handler if connection setup failed
      next(err);
    }
  }
}

export const documentController = new DocumentController();

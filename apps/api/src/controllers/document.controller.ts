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
   * Handles returning polling statuses.
   */
  public async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const documentId = req.params.id;
      const statusDetails = await documentService.getDocumentStatus(req.session.id, documentId);
      
      res.status(200).json(statusDetails);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handles SSE progress streaming connection configuration.
   */
  public async getProgressStream(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.session) {
        throw new UnauthorizedError();
      }

      const documentId = req.params.id;

      // Connect progress stream logic via service
      const initialPayload = await documentService.connectProgressStream(
        req.session.id,
        documentId,
        (payload) => {
          // Write progress notifications as SSE frames
          res.write(`data: ${JSON.stringify({
            documentId: payload.document_id,
            status: payload.status,
            progressPct: payload.progress_pct,
            processedChunks: payload.processed_chunks,
            totalChunks: payload.total_chunks,
            errorCode: payload.error_code,
            errorMessage: payload.error_message,
          })}\n\n`);
        },
        (cleanup) => {
          // Hook cleanup to closed connection event
          req.on('close', async () => {
            logger.info('SSE Client disconnected, executing stream cleanup', { documentId });
            await cleanup();
          });
        }
      );

      // Write SSE stream headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Push initial data frame immediately on connect
      res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);
    } catch (err) {
      // Forward to error handler if connection setup failed
      next(err);
    }
  }
}

export const documentController = new DocumentController();

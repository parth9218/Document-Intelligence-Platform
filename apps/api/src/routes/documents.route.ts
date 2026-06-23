import { Router } from 'express';
import { documentController } from '../controllers/document.controller';
import { validateRequestBody } from '../middlewares/request-validator';
import { validateBatchUploadInit } from '../validators/document.validator';

const router = Router();

// POST /api/documents - Batch initialization (guarded by request syntax validation)
router.post(
  '/',
  validateRequestBody(validateBatchUploadInit),
  (req, res, next) => documentController.initializeUploads(req, res, next)
);

// POST /api/documents/:id/confirm-upload - Confirm upload complete
router.post(
  '/:id/confirm-upload',
  (req, res, next) => documentController.confirmUpload(req, res, next)
);

// GET /api/documents/:id/status - Status polling fallback
router.get(
  '/:id/status',
  (req, res, next) => documentController.getStatus(req, res, next)
);

// GET /api/documents/:id/progress - SSE stream progress update tracking
router.get(
  '/:id/progress',
  (req, res, next) => documentController.getProgressStream(req, res, next)
);

export default router;

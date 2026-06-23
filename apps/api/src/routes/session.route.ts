import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';

const router = Router();

// GET /api/session - Fetch details of active session
router.get('/', (req, res, next) => sessionController.getActiveSession(req, res, next));

export default router;

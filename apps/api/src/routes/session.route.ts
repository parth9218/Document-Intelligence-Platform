import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';

const router = Router();

/**
 * @openapi
 * /api/session:
 *   get:
 *     summary: Retrieve Active Session Info
 *     description: Fetches metadata of the currently active session. Does not auto-create a session if no cookie is present.
 *     security:
 *       - CookieAuth: []
 *     responses:
 *       200:
 *         description: Active session details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - id
 *                 - expires_at
 *                 - created_at
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: 5e636494-48bf-44d2-90c3-33d9db0a5837
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Session is missing, expired, or signature is invalid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: unauthorized
 *                 message:
 *                   type: string
 *                   example: Unauthorized access
 */
router.get('/', (req, res, next) => sessionController.getActiveSession(req, res, next));

export default router;

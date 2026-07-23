import { Router } from 'express';
import { queryController } from '../controllers/query.controller';
import { validateQuerySearch } from '../validators/query.validator';

const router = Router();

/**
 * @openapi
 * /api/query/search:
 *   post:
 *     summary: Vector Similarity Search & Incremental Streaming Context
 *     description: Embeds a user question provided in the request body and executes a pgvector cosine similarity search against the vector store with strict session tenancy enforcement. Supports streaming responses (Accept text/event-stream or body stream=true) emitting context and token frames.
 *     security:
 *       - CookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 example: What is the processing status?
 *               stream:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *                 description: Set to true to force Server-Sent Events (SSE) streaming mode.
 *     responses:
 *       200:
 *         description: Search results containing relevant document chunks filtered by tenancy and distance threshold.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       documentId:
 *                         type: string
 *                         format: uuid
 *                       content:
 *                         type: string
 *                       pageNumber:
 *                         type: integer
 *                         nullable: true
 *                       distance:
 *                         type: number
 *                       filename:
 *                         type: string
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: "SSE stream broadcasting context, token, and done events."
 *       400:
 *         description: Validation error. Missing or empty query in request body.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized. Invalid session signature or expired session token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/search',
  validateQuerySearch,
  (req, res, next) => queryController.search(req, res, next)
);

export default router;

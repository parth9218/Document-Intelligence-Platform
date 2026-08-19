import { Router } from 'express';
import { documentController } from '../controllers/document.controller';
import { validateRequestBody } from '../middlewares/request-validator';
import { validateBatchUploadInit } from '../validators/document.validator';

const router = Router();

/**
 * @openapi
 * /api/documents:
 *   post:
 *     summary: Initialize Batch Document Upload
 *     description: Validates each file, checks concurrency/storage quotas, and generates S3 presigned POST fields. Automatically creates a session and sets the `session_token` cookie if not already active.
 *     security:
 *       - CookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documents
 *             properties:
 *               documents:
 *                 type: array
 *                 description: List of documents to initialize for upload.
 *                 items:
 *                   type: object
 *                   required:
 *                     - filename
 *                     - mimeType
 *                     - fileSizeBytes
 *                   properties:
 *                     filename:
 *                       type: string
 *                       example: invoice.pdf
 *                     mimeType:
 *                       type: string
 *                       example: application/pdf
 *                     fileSizeBytes:
 *                       type: integer
 *                       example: 1048576
 *     responses:
 *       200:
 *         description: Batch initialization results. Note that individual files can be rejected without failing the whole request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - filename
 *                       - status
 *                     properties:
 *                       filename:
 *                         type: string
 *                         example: invoice.pdf
 *                       status:
 *                         type: string
 *                         enum: [ready, rejected]
 *                         example: ready
 *                       documentId:
 *                         type: string
 *                         format: uuid
 *                         example: 6c8cf7ee-1250-48c6-a67b-234b68e0d6dc
 *                       uploadUrl:
 *                         type: string
 *                         format: uri
 *                         example: https://dip-uploads.s3.amazonaws.com/
 *                       uploadFields:
 *                         type: object
 *                         additionalProperties:
 *                           type: string
 *                         example:
 *                           key: sessions/5e636494-48bf-44d2-90c3-33d9db0a5837/documents/6c8cf7ee-1250-48c6-a67b-234b68e0d6dc/original
 *                           AWSAccessKeyId: AKIAIOSFODNN7EXAMPLE
 *                           policy: eyJleHBpcmF0aW9uIjoiMjAyNi0wNi0yNFQxOTo0MzoxM1oiLCJjb25kaXRpb25zIjpbWyJlcSIsIiRrZXkiLCJzZXNzaW9ucy81ZTYzNjQ5NC00OGJmLTQ0ZDItOTBjMy0zM2Q5ZGIwYTU4MzcvZG9jdW1lbnRzLzZjOGNmN2VlLTEyNTAtNDhjNi1hNjdiLTIzNGI2OGUwZDZkYy9vcmlnaW5hbCJdXX0=
 *                           signature: URIsign893475example=
 *                       s3Key:
 *                         type: string
 *                         example: sessions/5e636494-48bf-44d2-90c3-33d9db0a5837/documents/6c8cf7ee-1250-48c6-a67b-234b68e0d6dc/original
 *                       error:
 *                         type: string
 *                         example: invalid_mime_type
 *                       message:
 *                         type: string
 *                         example: Unsupported file type.
 *       400:
 *         description: Validation error (e.g. invalid request format) or storage quota exceeded.
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
 *       429:
 *         description: Rate limit or concurrency limit exceeded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  validateRequestBody(validateBatchUploadInit),
  (req, res, next) => documentController.initializeUploads(req, res, next)
);

/**
 * @openapi
 * /api/documents/{id}/confirm-upload:
 *   post:
 *     summary: Confirm Upload Complete
 *     description: Informs the backend that the client has successfully uploaded the file to S3. Transitions status to `uploaded`.
 *     security:
 *       - CookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The unique ID of the document.
 *     responses:
 *       200:
 *         description: Document upload successfully confirmed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *               properties:
 *                 status:
 *                   type: string
 *                   example: uploaded
 *       401:
 *         description: Unauthorized. Session token missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Document not found or does not belong to active session.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict. The upload for this document has already been confirmed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/:id/confirm-upload',
  (req, res, next) => documentController.confirmUpload(req, res, next)
);

/**
 * @openapi
 * /api/documents/status:
 *   get:
 *     summary: Get Session Documents Status (Polling Fallback)
 *     description: Retrieves the processing status of all documents uploaded in the active session.
 *     security:
 *       - CookieAuth: []
 *     responses:
 *       200:
 *         description: A list of documents with their current processing status.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - documents
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DocumentStatusObject'
 *       401:
 *         description: Unauthorized. Session token missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/status',
  (req, res, next) => documentController.getSessionStatus(req, res, next)
);

/**
 * @openapi
 * /api/documents/progress:
 *   get:
 *     summary: Real-Time Ingestion Progress Stream (SSE)
 *     description: |
 *       Establishes a Server-Sent Events (SSE) connection to stream real-time document ingestion updates.
 *       
 *       Upon establishing connection, the stream immediately sends a `snapshot` event containing an array of all active documents.
 *       As ingestion progress updates occur, the stream broadcasts `update` events containing the updated DocumentStatusObject.
 *     security:
 *       - CookieAuth: []
 *     responses:
 *       200:
 *         description: Connection established successfully. Streams EventSource events.
 *         headers:
 *           Content-Type:
 *             schema:
 *               type: string
 *               example: text/event-stream
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: no-cache
 *           Connection:
 *             schema:
 *               type: string
 *               example: keep-alive
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: "SSE stream content with `event: snapshot` and `event: update` rows."
 *       401:
 *         description: Unauthorized. Session token missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/progress',
  (req, res, next) => documentController.getProgressStream(req, res, next)
);

export default router;

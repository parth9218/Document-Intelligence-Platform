import express from 'express';
import { getSession, sessionMiddleware } from './middlewares/session';
import { sessionController } from './controllers/session.controller';
import documentsRouter from './routes/documents.route';
import { errorHandler } from './middlewares/error-handler';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { config } from './config';

const app = express();

app.use(express.json());

// Mount OpenAPI documentation UI (conditional on environment, before session check middlewares)
if (config.nodeEnv === 'production') {
  app.use('/api-docs', (req, res) => {
    res.status(404).send('Not Found');
  });
} else {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health Check
 *     description: Returns the status of the API server.
 *     responses:
 *       200:
 *         description: Server is up and running.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Apply session creation/verification middleware globally to subsequent routes & fallbacks
app.use(sessionMiddleware);

// Mount active session details fetch (auto-creates session if missing)
app.get('/api/session', (req, res, next) => sessionController.getActiveSession(req, res, next));

// Mount protected document tracking routes
app.use('/api/documents', documentsRouter);

// Mount centralized error handler middleware (registered last)
app.use(errorHandler);

export default app;

import express, { Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
import { getSession, sessionMiddleware } from './middlewares/session';
import { sessionController } from './controllers/session.controller';
import documentsRouter from './routes/documents.route';
import queryRouter from './routes/query.route';
import { errorHandler } from './middlewares/error-handler';
import { requestLogger } from './middlewares/logger';
import { config } from './config';

const app = express();

// ---------------------------------------------------------------------------
// CORS — must be registered before all other middleware so that preflight
// OPTIONS requests are resolved immediately (ADR-018).
// ---------------------------------------------------------------------------
const corsOptions: CorsOptions = {
  // Allow credentials (session cookies) to be sent cross-origin.
  credentials: true,

  // Supported HTTP methods including OPTIONS for preflight.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  // Explicit allowed headers for credentialed requests.
  allowedHeaders: ['Content-Type', 'Cookie', 'Authorization'],

  // Cache preflight response for 24 hours to reduce network overhead.
  maxAge: 86400,

  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
    // Requests with no Origin header (e.g. same-origin, curl, server-to-server)
    // are always allowed — no cross-origin restriction applies.
    if (!origin) {
      return callback(null, true);
    }

    if (config.nodeEnv === 'local') {
      // Local / test: dynamically reflect the request Origin so all local
      // ports work without manual configuration. Wildcard '*' cannot be used
      // when credentials are enabled.
      callback(null, origin);
    } else {
      // Production: strict whitelist — only the configured frontend origin is allowed.
      if (origin === config.cors.allowedOrigin) {
        callback(null, origin);
      } else {
        callback(new Error(`CORS: origin '${origin}' is not allowed`));
      }
    }
  },
};

app.use(cors(corsOptions));

// Respond immediately to preflight OPTIONS requests after CORS headers are set.
app.options('*', cors(corsOptions));

app.use(express.json());

// Global HTTP request logging (industry standard telemetry)

// Mount OpenAPI documentation UI (conditional on environment, before session check middlewares)
if (config.nodeEnv === "dev" || config.nodeEnv === "local") {
  const swaggerUi = require('swagger-ui-express');
  const { swaggerSpec } = require('./config/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  app.use('/api-docs', (req, res) => {
    res.status(404).send('Not Found');
  });
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
app.use(requestLogger);
app.use(sessionMiddleware);

// Mount active session details fetch (auto-creates session if missing)
app.get('/api/session', (req, res, next) => sessionController.getActiveSession(req, res, next));

// Mount protected document tracking routes
app.use('/api/documents', documentsRouter);

// Mount protected similarity search query routes
app.use('/api/query', queryRouter);

// Mount centralized error handler middleware (registered last)
app.use(errorHandler);

export default app;

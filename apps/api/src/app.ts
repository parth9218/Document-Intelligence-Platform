import express from 'express';
import { getSession, sessionMiddleware } from './middlewares/session';
import { sessionController } from './controllers/session.controller';
import documentsRouter from './routes/documents.route';
import { errorHandler } from './middlewares/error-handler';

const app = express();

app.use(express.json());

// Basic health check route (exempt from session checks)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount active session details fetch (runs getSession only - no auto-creation)
app.get('/api/session', getSession, (req, res, next) => sessionController.getActiveSession(req, res, next));

// Apply session creation/verification middleware globally to subsequent routes & fallbacks
app.use(sessionMiddleware);

// Mount protected document tracking routes
app.use('/api/documents', documentsRouter);

// Mount centralized error handler middleware (registered last)
app.use(errorHandler);

export default app;

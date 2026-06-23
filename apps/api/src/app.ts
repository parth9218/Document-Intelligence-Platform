import express from 'express';
import { sessionMiddleware, getSession } from './middleware/session';
import sessionRouter from './routes/session';
import documentsRouter from './routes/documents';

const app = express();

app.use(express.json());

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/session', getSession, sessionRouter);

// Apply session middleware to all API requests
app.use(sessionMiddleware);

// Mount routes
app.use('/api/documents', documentsRouter);

export default app;


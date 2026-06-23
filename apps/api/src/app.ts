import express from 'express';
import { sessionMiddleware } from './middleware/session';
import sessionRouter from './routes/session';

const app = express();

app.use(express.json());

// Apply session middleware to all API requests
app.use(sessionMiddleware);

// Mount routes
app.use('/api/session', sessionRouter);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', session_id: req.session?.id });
});

export default app;

import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

import app from './app';
import { startCleanupJob } from './jobs/cleanup';

const PORT = process.env.PORT || 3000;

const cleanupInterval = startCleanupJob();

const server = app.listen(PORT, () => {
  console.log(`API Server is running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  clearInterval(cleanupInterval);
  server.close(() => {
    console.log('HTTP server closed');
  });
});


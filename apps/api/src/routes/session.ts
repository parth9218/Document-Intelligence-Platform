import { Router } from 'express';

const router = Router();

// Endpoint to retrieve details of the active session
router.get('/', (req, res) => {
  if (!req.session) {
    return res.status(401).json({ error: 'No active session' });
  }
  return res.json({
    id: req.session.id,
    expires_at: req.session.expires_at,
    created_at: req.session.created_at,
  });
});

export default router;

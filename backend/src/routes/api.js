import express from 'express';
import healthRoutes from './health.js';

const router = express.Router();

router.use('/health', healthRoutes);

router.get('/', (req, res) => {
  res.json({
    message: 'WolfMart demo shop API',
    version: '0.1.0',
    phase: 'P0 — isolation boundary only',
    endpoints: { health: '/api/health' },
  });
});

export default router;

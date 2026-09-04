import express from 'express';
import { ALLOWED_HOSTS, isEgressAllowlistInstalled } from '../security/egress.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'wolfmart-demo-shop',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    // Surfaced so the boundary is verifiable from outside the box, not just
    // asserted in a test.
    egressAllowlist: {
      installed: isEgressAllowlistInstalled(),
      allowedHosts: ALLOWED_HOSTS,
    },
  });
});

export default router;

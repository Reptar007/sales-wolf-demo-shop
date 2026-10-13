import express from 'express';
import { prisma } from '../db.js';
import { ALLOWED_HOSTS, isEgressAllowlistInstalled } from '../security/egress.js';

const router = express.Router();

/**
 * Which demo switches are on, by panel label. Public on purpose: an AE checks
 * "is the store clean for my call?" from /status without the demo passphrase.
 * Read-only — flipping or resetting a switch still needs a staff session.
 * Null when the database can't answer, so health itself never goes down.
 */
async function demoSwitchesOn() {
  try {
    const rows = await prisma.chaosFlag.findMany({
      where: { enabled: true },
      select: { label: true },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => r.label);
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
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
    demoSwitchesOn: await demoSwitchesOn(),
  });
});

export default router;

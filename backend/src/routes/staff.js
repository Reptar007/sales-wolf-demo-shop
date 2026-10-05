import express from 'express';
import { HttpError } from '../http/errors.js';
import { createLimiter, limitByIp } from '../http/rateLimit.js';
import {
  clearStaffCookie,
  isStaff,
  issueStaffCookie,
  passphraseConfigured,
  passphraseMatches,
} from '../http/staff.js';

const router = express.Router();

// Tight: the passphrase is short and shared, so guessing must be slow.
export const staffLimiter = createLimiter({ windowMs: 60_000, max: 10 });

router.get('/session', (req, res) => {
  res.json({ staff: isStaff(req), configured: passphraseConfigured() });
});

router.post('/session', limitByIp(staffLimiter), (req, res) => {
  if (!passphraseConfigured()) {
    throw new HttpError(
      503,
      'NOT_CONFIGURED',
      'DEMO_CONTROL_PASSPHRASE is not set on this server.',
    );
  }
  if (!passphraseMatches(req.body?.passphrase)) {
    throw new HttpError(401, 'BAD_PASSPHRASE', 'That passphrase isn’t right.');
  }
  issueStaffCookie(res);
  res.json({ staff: true, configured: true });
});

router.delete('/session', (req, res) => {
  clearStaffCookie(res);
  res.json({ staff: false, configured: passphraseConfigured() });
});

export default router;

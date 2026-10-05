/**
 * The SE-only side of the demo: the chat agent console (/agent) and the demo
 * control panel (/demo-control). One shared passphrase (DEMO_CONTROL_PASSPHRASE)
 * unlocks both, issuing a short-lived signed cookie.
 *
 * This is a speed bump for prospects poking around, not real access control —
 * nothing behind it touches anything but this app's own fictional data.
 */

import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';
import { cookieOptions } from './identity.js';

export const STAFF_COOKIE = 'wm_staff';
const STAFF_TTL = 12 * 60 * 60 * 1000;

function secret() {
  const value = process.env.DEMO_JWT_SECRET;
  if (!value) throw new Error('DEMO_JWT_SECRET is not set. See .env.example.');
  return value;
}

export function passphraseConfigured() {
  return Boolean(process.env.DEMO_CONTROL_PASSPHRASE);
}

export function passphraseMatches(candidate) {
  const expected = process.env.DEMO_CONTROL_PASSPHRASE;
  if (!expected || typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueStaffCookie(res) {
  const token = jwt.sign({ role: 'staff' }, secret(), { expiresIn: STAFF_TTL / 1000 });
  res.cookie(STAFF_COOKIE, token, cookieOptions(STAFF_TTL));
}

export function clearStaffCookie(res) {
  res.clearCookie(STAFF_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

/** True for a valid staff token. Works on Express requests and socket handshakes alike. */
export function isStaffToken(token) {
  if (!token) return false;
  try {
    return jwt.verify(token, secret()).role === 'staff';
  } catch {
    return false;
  }
}

export function isStaff(req) {
  return isStaffToken(req.cookies?.[STAFF_COOKIE]);
}

export function requireStaff(req, res, next) {
  if (!isStaff(req)) return next(new HttpError(401, 'STAFF_ONLY', 'Enter the demo passphrase.'));
  next();
}

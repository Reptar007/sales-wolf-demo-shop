/**
 * Who is making this request: an anonymous visitor (always) and, optionally, a
 * signed-in demo user.
 *
 * The visitor cookie keys anonymous carts, guest orders, the demo inbox, chat,
 * and assistant rate limits. The session cookie is a JWT signed with this
 * app's own DEMO_JWT_SECRET — never another app's secret.
 */

import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { unauthorized } from './errors.js';

export const VISITOR_COOKIE = 'wm_visitor';
export const SESSION_COOKIE = 'wm_session';

const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

export function cookieOptions(maxAge) {
  return { httpOnly: true, secure: isProduction(), sameSite: 'lax', path: '/', maxAge };
}

function jwtSecret() {
  const secret = process.env.DEMO_JWT_SECRET;
  if (!secret) throw new Error('DEMO_JWT_SECRET is not set. See .env.example.');
  return secret;
}

export function signSession(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, jwtSecret(), {
    expiresIn: SESSION_TTL / 1000,
  });
}

/** Returns the session claims, or null for a missing / expired / forged token. */
export function readSession(token) {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, jwtSecret());
    return { id: claims.sub, email: claims.email, name: claims.name };
  } catch {
    return null;
  }
}

export function setSessionCookie(res, user) {
  res.cookie(SESSION_COOKIE, signSession(user), cookieOptions(SESSION_TTL));
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined });
}

const VISITOR_ID = /^[0-9a-f-]{36}$/;

export function identity(req, res, next) {
  let visitorId = req.cookies?.[VISITOR_COOKIE];
  if (!visitorId || !VISITOR_ID.test(visitorId)) {
    visitorId = randomUUID();
    res.cookie(VISITOR_COOKIE, visitorId, cookieOptions(ONE_YEAR));
  }
  req.visitorId = visitorId;
  req.user = readSession(req.cookies?.[SESSION_COOKIE]);
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

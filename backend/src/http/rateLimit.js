/**
 * Fixed-window, in-memory rate limiting. One dyno, so memory is the right
 * store; a second dyno would need Postgres or Redis here instead.
 */

import { HttpError } from './errors.js';

export function createLimiter({ windowMs, max }) {
  const hits = new Map();

  function sweep(now) {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }

  return {
    /** Counts one hit; returns { ok, remaining, retryAfterMs }. */
    hit(key) {
      const now = Date.now();
      if (hits.size > 10_000) sweep(now);
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      return {
        ok: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        retryAfterMs: entry.resetAt - now,
      };
    },
    reset() {
      hits.clear();
    },
  };
}

/** Express middleware that limits by client IP. */
export function limitByIp(
  limiter,
  message = 'Too many attempts. Please wait a minute and try again.',
) {
  return (req, res, next) => {
    const result = limiter.hit(req.ip);
    if (!result.ok) {
      res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
      return next(new HttpError(429, 'RATE_LIMITED', message));
    }
    next();
  };
}

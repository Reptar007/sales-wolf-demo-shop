/**
 * Spend and abuse limits for the public assistant endpoint.
 *
 * - Per-IP and per-reset limits are in memory (one dyno; see http/rateLimit.js).
 * - The per-conversation cap and the monthly budget are in Postgres, because
 *   they must survive a restart.
 * - IPs are only ever stored as a salted SHA-256 hash.
 */

import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { createLimiter } from '../http/rateLimit.js';
import { LIMITS, monthlyBudgetMicros } from './config.js';

const HOUR = 60 * 60 * 1000;

export const messageLimiter = createLimiter({
  windowMs: HOUR,
  max: LIMITS.maxMessagesPerIpPerHour,
});
export const resetLimiter = createLimiter({ windowMs: HOUR, max: LIMITS.maxResetsPerIpPerHour });

/** Visitors with a reply in flight, so one browser can't run turns in parallel. */
const inFlight = new Set();

export function claimTurn(visitorId) {
  if (inFlight.has(visitorId)) return false;
  inFlight.add(visitorId);
  return true;
}

export function releaseTurn(visitorId) {
  inFlight.delete(visitorId);
}

/** Tests only. */
export function resetLimits() {
  messageLimiter.reset();
  resetLimiter.reset();
  inFlight.clear();
}

export function hashIp(ip) {
  // Salted with this app's own secret so the hash can't be reversed from a
  // table of IPv4 hashes. Falls back to a fixed salt when unset (tests).
  const salt = process.env.DEMO_JWT_SECRET || 'wolfmart-assistant';
  return createHash('sha256')
    .update(`${salt}:${ip ?? ''}`)
    .digest('hex');
}

export function startOfUtcMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Micro-dollars spent this calendar month (UTC). */
export async function monthSpendMicros(now = new Date()) {
  const result = await prisma.assistantSession.aggregate({
    _sum: { costMicros: true },
    where: { updatedAt: { gte: startOfUtcMonth(now) } },
  });
  return result._sum.costMicros ?? 0;
}

export async function budgetExhausted() {
  return (await monthSpendMicros()) >= monthlyBudgetMicros();
}

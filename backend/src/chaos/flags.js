/**
 * Reads the demo's chaos flags (plan §6.4).
 *
 * Every bug is injected server-side, so what QA Wolf catches is what a real
 * customer would hit — not a client-only fake a prospect could see through.
 *
 * Flags are cached for a moment so a busy page doesn't query per request, and
 * the cache is dropped the instant an SE flips a flag, so the demo reacts live.
 */

import { prisma } from '../db.js';

const TTL_MS = 2000;
let cache = null;
let cachedAt = 0;

export async function enabledFlags() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await prisma.chaosFlag.findMany({ where: { enabled: true }, select: { key: true } });
  cache = new Set(rows.map((r) => r.key));
  cachedAt = Date.now();
  return cache;
}

export async function isEnabled(key) {
  return (await enabledFlags()).has(key);
}

export function invalidateFlags() {
  cache = null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

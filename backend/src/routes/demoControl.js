/**
 * The demo control panel's API (plan §6.4). SE-only: every route sits behind
 * the shared passphrase, because a prospect who finds /demo-control could
 * otherwise break the store for the next call.
 *
 * Every write drops the flag cache, so a flip takes effect on the very next
 * request rather than up to two seconds later — mid-call, that gap shows.
 */

import express from 'express';
import { prisma } from '../db.js';
import { invalidateFlags } from '../chaos/flags.js';
import { badRequest, notFound } from '../http/errors.js';
import { requireStaff } from '../http/staff.js';
import { resetDemoData } from '../seed/reset.js';
import { CHAOS_FLAGS } from '../seed/data.js';

const router = express.Router();
router.use(requireStaff);

const FLAG_SELECT = {
  key: true,
  label: true,
  description: true,
  proves: true,
  enabled: true,
  updatedAt: true,
};

/**
 * Seed order is the plan's order, which is the order the runbook walks through.
 * (createdAt can't give it: createMany stamps every row with the same instant.)
 */
const SEED_ORDER = new Map(CHAOS_FLAGS.map((f, i) => [f.key, i]));
const position = (key) => SEED_ORDER.get(key) ?? SEED_ORDER.size;

async function listFlags() {
  const flags = await prisma.chaosFlag.findMany({ select: FLAG_SELECT, orderBy: { key: 'asc' } });
  return flags.sort((a, b) => position(a.key) - position(b.key));
}

router.get('/flags', async (req, res) => {
  res.json({ flags: await listFlags() });
});

router.patch('/flags/:key', async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') throw badRequest('enabled must be true or false.');

  const { count } = await prisma.chaosFlag.updateMany({
    where: { key: req.params.key },
    data: { enabled },
  });
  if (count === 0) throw notFound('No such chaos flag.');
  invalidateFlags();
  // Only the key and state: enough to line up a demo's failures with its flips.
  console.log(`[demo-control] flag ${req.params.key} -> ${enabled ? 'on' : 'off'}`);

  const flag = await prisma.chaosFlag.findUnique({
    where: { key: req.params.key },
    select: FLAG_SELECT,
  });
  res.json({ flag });
});

/** The panel's "Reset all": every flag off, the store healthy again. */
router.post('/flags/reset', async (req, res) => {
  const { count } = await prisma.chaosFlag.updateMany({
    where: { enabled: true },
    data: { enabled: false },
  });
  invalidateFlags();
  console.log(`[demo-control] reset all flags (${count} were on)`);
  res.json({ flags: await listFlags() });
});

/**
 * Re-seeds everything. Wipes every cart, order, account, and chat, so the body
 * has to say so explicitly — a stray click or replayed request can't do it.
 */
router.post('/reset-data', async (req, res) => {
  if (req.body?.confirm !== 'RESET') {
    throw badRequest('Send { "confirm": "RESET" } to wipe and re-seed the demo data.');
  }
  const started = Date.now();
  const counts = await resetDemoData(prisma);
  invalidateFlags();
  console.log(`[demo-control] demo data reset (${Date.now() - started}ms)`);
  res.json({ ok: true, ...counts, flags: await listFlags() });
});

export default router;

/**
 * CLI entry for `npm run demo:reset` and `prisma db seed`. Heroku Scheduler runs
 * this nightly (see docs/RUNBOOK.md).
 */

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../db.js';
import { resetDemoData } from './reset.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const started = Date.now();
try {
  const counts = await resetDemoData(getPrisma());
  console.log(
    `[demo:reset] seeded ${counts.products} products in ${counts.categories} categories, ` +
      `${counts.users} demo accounts (${Date.now() - started}ms)`,
  );
} catch (error) {
  console.error('[demo:reset] failed:', error);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}

/**
 * Release-phase seed for Heroku Review Apps.
 *
 * A review app used to seed from app.json's `postdeploy`, which Heroku runs in
 * a one-off dyno after the deploy is already reported successful. QA Wolf starts
 * its PR run on that report, so its first attempts hit an empty catalog and
 * failed at "Add to cart" for a reason unrelated to the PR.
 *
 * The release phase runs before the new web dyno takes traffic and before the
 * deploy is reported, so seeding here means the store is full by the time
 * anything can test it. It reseeds on every review-app release, so each PR
 * push starts from the same clean data.
 *
 * Production and local runs never reach the reset: only a review app sets
 * HEROKU_PR_NUMBER.
 */

import { fileURLToPath } from 'node:url';

export function isReviewApp(env = process.env) {
  return Boolean(env.HEROKU_PR_NUMBER);
}

async function main() {
  if (!isReviewApp()) {
    console.log('[release-seed] not a review app; leaving data as is');
    return;
  }
  const { disconnectPrisma, getPrisma } = await import('../db.js');
  const { resetDemoData } = await import('./reset.js');
  const started = Date.now();
  try {
    const counts = await resetDemoData(getPrisma());
    console.log(
      `[release-seed] review app PR #${process.env.HEROKU_PR_NUMBER}: seeded ` +
        `${counts.products} products (${Date.now() - started}ms)`,
    );
  } catch (error) {
    console.error('[release-seed] failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

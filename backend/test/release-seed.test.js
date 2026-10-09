/**
 * The release-phase seed wipes every table, so the one thing that must never
 * change is that it only runs on a review app.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isReviewApp } from '../src/seed/release.js';

test('a review app is recognised by HEROKU_PR_NUMBER', () => {
  assert.equal(isReviewApp({ HEROKU_PR_NUMBER: '16' }), true);
});

test('production and local runs are never treated as a review app', () => {
  assert.equal(isReviewApp({}), false);
  assert.equal(isReviewApp({ HEROKU_PR_NUMBER: '' }), false);
  assert.equal(isReviewApp({ HEROKU_APP_NAME: 'sales-wolf-demo-shop' }), false);
});

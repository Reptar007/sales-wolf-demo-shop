/**
 * Repo-level guard against SalesWolf coupling creeping in over time.
 *
 * The runtime allowlist stops outbound calls; this stops the code, config, and
 * credentials that would make such a call look intentional from ever landing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * What counts as coupling.
 *
 * The bar is deliberately NOT the word "SalesWolf". Explaining in a comment why
 * SalesWolf is off-limits is the behaviour we want — banning the word would
 * punish it and push the reasoning out of the code. What actually couples the
 * two apps is a reachable host, a shared credential, or an import, so those are
 * what this matches.
 *
 * Note the host patterns are exact domains: `saleswolf.com` (no hyphen) and
 * `sales-wolf.com` (the toolkit's public domain, `.com` included). This repo is
 * named `sales-wolf-demo-shop`; a fuzzier pattern like `sales-wolf` would fail
 * the build on the repo's own name. Do not "fix" it to be broader.
 */
const FORBIDDEN_HOSTS = ['saleswolf.com', 'sales-wolf.com', 'qa-sales-engineering'];

/** SalesWolf credentials. Their presence here means a config var leaked across. */
const FORBIDDEN_SECRETS = [
  'SALESFORCE_',
  'NOTION_API_KEY',
  'LINEAR_API_KEY',
  'INTEGRATION_ENCRYPTION_KEY',
  'SNAPSHOT_YEARS',
];

/**
 * The allowlist and its tests name SalesWolf hosts on purpose — that is where
 * the denial is declared. Nowhere else has a reason to.
 */
const HOST_EXEMPT = ['backend/src/security/egress.js', 'backend/test/'];

/** .env.example names the forbidden vars to document that they are never set. */
const SECRET_EXEMPT = ['.env.example', 'backend/test/'];

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

test('no SalesWolf hosts or credentials in tracked source', (t) => {
  let files;
  try {
    files = trackedFiles();
  } catch {
    t.skip('not a git checkout yet');
    return;
  }

  const offenders = [];
  for (const file of files) {
    let contents;
    try {
      contents = readFileSync(resolve(repoRoot, file), 'utf8');
    } catch {
      continue; // binary or deleted
    }
    const lower = contents.toLowerCase();

    if (!HOST_EXEMPT.some((prefix) => file.startsWith(prefix))) {
      for (const host of FORBIDDEN_HOSTS) {
        if (lower.includes(host)) offenders.push(`${file} references host "${host}"`);
      }
    }
    if (!SECRET_EXEMPT.some((prefix) => file.startsWith(prefix))) {
      for (const secret of FORBIDDEN_SECRETS) {
        if (contents.includes(secret)) offenders.push(`${file} references secret "${secret}"`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `WolfMart must stay decoupled from SalesWolf:\n${offenders.join('\n')}`,
  );
});

test('the server installs the allowlist before it listens', () => {
  const source = readFileSync(resolve(repoRoot, 'backend/src/index.js'), 'utf8');
  const install = source.indexOf('installEgressAllowlist()');
  const listen = source.indexOf('app.listen');
  assert.ok(install > -1, 'index.js must call installEgressAllowlist()');
  assert.ok(listen > -1, 'index.js must call app.listen');
  assert.ok(install < listen, 'installEgressAllowlist() must run before app.listen');
  assert.ok(
    source.includes('assertEgressAllowlistInstalled()'),
    'index.js must assert the allowlist before serving',
  );
});

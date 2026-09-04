/**
 * Proves the hard requirement: this app cannot reach SalesWolf.
 *
 * These tests make no network connection to a real host. Blocked requests fail
 * at the allowlist, and the one allowed host is asserted by policy rather than
 * by dialing it, so the suite is offline-safe and deterministic in CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {
  ALLOWED_HOSTS,
  EgressBlockedError,
  NEVER_ALLOWED,
  installEgressAllowlist,
  isAllowedHost,
  isEgressAllowlistInstalled,
} from '../src/security/egress.js';

installEgressAllowlist();

test('the allowlist installs', () => {
  assert.equal(isEgressAllowlistInstalled(), true);
});

test('SalesWolf hosts are refused', () => {
  for (const host of [
    'saleswolf.com',
    'www.saleswolf.com',
    'api.saleswolf.com',
    'qa-sales-engineering.herokuapp.com',
    // Case and a trailing dot are the same host to a resolver, so they must be
    // the same host to the allowlist.
    'SalesWolf.com',
    'saleswolf.com.',
  ]) {
    assert.equal(isAllowedHost(host), false, `${host} must be blocked`);
  }
});

test('everything not on the allowlist is refused by default', () => {
  for (const host of [
    'example.com',
    'api.openai.com',
    'localhost',
    '127.0.0.1',
    '169.254.169.254', // cloud metadata endpoint — the classic SSRF target
    '',
  ]) {
    assert.equal(isAllowedHost(host), false, `${host} must be blocked`);
  }
});

test('the Anthropic API is permitted', () => {
  assert.equal(isAllowedHost('api.anthropic.com'), true);
  assert.deepEqual([...ALLOWED_HOSTS], ['api.anthropic.com']);
});

test('an explicit denial beats the allowlist', () => {
  // Guards the failure mode where someone widens ALLOWED_HOSTS and silently
  // re-opens a path to SalesWolf.
  assert.ok(NEVER_ALLOWED.includes('saleswolf.com'));
  for (const host of NEVER_ALLOWED) {
    assert.equal(isAllowedHost(host), false);
  }
});

test('fetch to SalesWolf rejects rather than connecting', async () => {
  await assert.rejects(
    () => fetch('https://saleswolf.com/api/opps'),
    /Egress blocked|fetch failed/,
  );
});

test('https.request to SalesWolf throws', () => {
  assert.throws(() => https.request('https://saleswolf.com/'), EgressBlockedError);
  assert.throws(() => https.request({ hostname: 'saleswolf.com', path: '/' }), EgressBlockedError);
});

test('http.get to SalesWolf throws', () => {
  // http.get delegates to http.request; this catches a rebinding regression
  // that would leave a hole in the legacy stack.
  assert.throws(() => http.get('http://saleswolf.com/'), EgressBlockedError);
});

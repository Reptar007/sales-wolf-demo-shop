/**
 * The Anthropic client, behind a factory so tests can inject a fake one and
 * never touch the network.
 *
 * In production the SDK uses global fetch, which the egress allowlist
 * (security/egress.js) restricts to api.anthropic.com.
 */

import Anthropic from '@anthropic-ai/sdk';

function defaultFactory() {
  // Explicit key only: never fall back to a developer's local `ant auth`
  // profile, so "no key configured" really means the assistant is offline.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return new Anthropic({ apiKey, authToken: null, maxRetries: 1, timeout: 60_000 });
}

let factory = defaultFactory;
let cached;

/** Returns the client, or null when no API key is configured. */
export function getAssistantClient() {
  if (cached === undefined) cached = factory() ?? null;
  return cached;
}

/** Tests: swap in a fake client factory. Pass nothing to restore the real one. */
export function setAssistantClientFactory(next) {
  factory = next ?? defaultFactory;
  cached = undefined;
}

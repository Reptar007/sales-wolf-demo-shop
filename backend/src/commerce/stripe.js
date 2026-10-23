/**
 * The Stripe client, behind a factory so tests can inject a fake one and never
 * touch the network (same pattern as assistant/client.js).
 *
 * The SDK uses Node's https.request, which the egress allowlist
 * (security/egress.js) restricts to api.stripe.com.
 */

import Stripe from 'stripe';

function defaultFactory() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 20_000 });
}

let factory = defaultFactory;
let cached;

/** Returns the client, or null when no secret key is configured. */
export function getStripe() {
  if (cached === undefined) cached = factory() ?? null;
  return cached;
}

/** Safe to send to the browser: a publishable key, never the secret one. */
export function publishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

/** Tests: swap in a fake client factory. Pass nothing to restore the real one. */
export function setStripeClientFactory(next) {
  factory = next ?? defaultFactory;
  cached = undefined;
}

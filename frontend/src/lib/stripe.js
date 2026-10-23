/**
 * Stripe.js, loaded once. The publishable key comes from the server at runtime
 * (GET /api/payments/config), so the same build works on every Heroku app and
 * a key change is a config-var change, not a rebuild. Resolves to null when
 * the server has no Stripe keys, and the wallet buttons stay hidden.
 */

import { loadStripe } from '@stripe/stripe-js';
import { api } from './api.js';

let stripePromise;

export function getStripe() {
  stripePromise ??= api('/payments/config')
    .then(({ enabled, publishableKey }) => (enabled ? loadStripe(publishableKey) : null))
    .catch(() => null);
  return stripePromise;
}

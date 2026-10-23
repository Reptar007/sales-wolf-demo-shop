/**
 * A fake Stripe client for payments tests: just the calls routes/payments.js
 * makes, kept in memory. Nothing leaves the process.
 *
 * `succeed(id, wallet)` plays the part of the shopper's phone confirming the
 * payment in Apple Pay / Google Pay.
 */

import { randomUUID } from 'node:crypto';

export function createFakeStripe() {
  const intents = new Map();
  const refunds = [];

  const notFound = () =>
    Object.assign(new Error('No such payment_intent'), {
      type: 'StripeInvalidRequestError',
      statusCode: 404,
    });

  return {
    intents,
    succeed(id, wallet = 'apple_pay') {
      const intent = intents.get(id);
      intent.status = 'succeeded';
      intent.latest_charge = {
        id: `ch_fake_${id}`,
        payment_method_details: {
          card: { brand: 'visa', last4: '4242', wallet: { type: wallet } },
        },
      };
    },
    paymentIntents: {
      async create(params) {
        // Unique across fakes: orders from earlier tests stay in the database.
        const id = `pi_fake${randomUUID().replaceAll('-', '')}`;
        const intent = {
          id,
          object: 'payment_intent',
          client_secret: `${id}_secret_fake`,
          status: 'requires_payment_method',
          latest_charge: null,
          ...structuredClone(params),
        };
        intents.set(id, intent);
        return structuredClone(intent);
      },
      async retrieve(id) {
        if (!intents.has(id)) throw notFound();
        return structuredClone(intents.get(id));
      },
    },
    refunds: Object.assign(refunds, {
      async create(params) {
        refunds.push(params);
        return { id: `re_fake${refunds.length}`, ...params };
      },
    }),
  };
}

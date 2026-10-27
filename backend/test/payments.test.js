/**
 * Apple Pay / Google Pay over HTTP, against a fake Stripe: the server prices
 * every PaymentIntent itself, writes the order only for a payment that really
 * succeeded and matches, and never writes it twice.
 */

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, hasTestDatabase, startTestServer } from './helpers/server.js';
import { createFakeStripe } from './helpers/fakeStripe.js';
import { setStripeClientFactory } from '../src/commerce/stripe.js';

const WALLET = {
  email: 'Wallet@WolfMart.test',
  shipping: {
    name: 'Wallet Shopper',
    address: {
      line1: '1 Test Way',
      city: 'Lupine Falls',
      state: 'OR',
      postal_code: '97000',
      country: 'US',
    },
  },
};

describe('wallet payments', { skip: !hasTestDatabase() && 'TEST_DATABASE_URL not set' }, () => {
  let app;
  let stripe;
  const savedKey = process.env.STRIPE_PUBLISHABLE_KEY;

  before(async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake';
    app = await startTestServer();
  });
  beforeEach(() => {
    stripe = createFakeStripe();
    setStripeClientFactory(() => stripe);
  });
  after(async () => {
    setStripeClientFactory();
    process.env.STRIPE_PUBLISHABLE_KEY = savedKey;
    await app?.close();
  });

  async function shopperWith(slug, quantity = 1) {
    const shopper = createClient(app.baseUrl);
    const { body } = await shopper.json(`/api/products/${slug}`);
    const variant = body.product.variants.find((v) => v.stock > 0);
    await shopper.json('/api/cart/items', {
      method: 'POST',
      body: { variantId: variant.id, quantity },
    });
    return { shopper, variant };
  }

  test('config hands out the publishable key only', async () => {
    const { body } = await createClient(app.baseUrl).json('/api/payments/config');
    assert.deepEqual(body, { enabled: true, publishableKey: 'pk_test_fake' });
    assert.doesNotMatch(JSON.stringify(body), /sk_/);
  });

  test('with no Stripe keys the wallet turns itself off', async () => {
    setStripeClientFactory(() => null);
    const client = createClient(app.baseUrl);
    const config = await client.json('/api/payments/config');
    assert.deepEqual(config.body, { enabled: false, publishableKey: null });
    const quote = await client.json('/api/payments/quote', {
      method: 'POST',
      body: { source: 'cart' },
    });
    assert.equal(quote.status, 503);
    assert.equal(quote.body.code, 'PAYMENTS_DISABLED');
  });

  test('cart: server-priced intent, order on success, idempotent complete', async () => {
    const { shopper } = await shopperWith('cast-iron-skillet', 2);
    await shopper.json('/api/cart/promo', { method: 'POST', body: { code: 'WOLF10' } });
    const cart = (await shopper.json('/api/cart?shippingMethod=express')).body.cart;

    const quote = await shopper.json('/api/payments/quote', {
      method: 'POST',
      body: { source: 'cart' },
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.quote.quotes.express.totalCents, cart.totals.totalCents);
    assert.deepEqual(
      quote.body.quote.shippingRates.map((r) => r.id),
      ['standard', 'express'],
    );

    const intent = await shopper.json('/api/payments/intent', {
      method: 'POST',
      // A tampered client amount is ignored: the server prices the cart itself.
      body: { source: 'cart', shippingMethod: 'express', amount: 1, ...WALLET },
    });
    assert.equal(intent.status, 201);
    assert.equal(intent.body.amountCents, cart.totals.totalCents);
    const created = stripe.intents.get(intent.body.paymentIntentId);
    assert.equal(created.amount, cart.totals.totalCents);
    assert.equal(created.currency, 'usd');
    assert.equal(created.metadata.promoCode, 'WOLF10');
    assert.equal(created.receipt_email, 'wallet@wolfmart.test');
    // Stripe.js sets shipping on confirm; setting it here would make that a 400.
    assert.equal(created.shipping, undefined);
    assert.equal(created.metadata.shipCity, 'Lupine Falls');

    const early = await shopper.json('/api/payments/complete', {
      method: 'POST',
      body: { paymentIntentId: intent.body.paymentIntentId },
    });
    assert.equal(early.status, 402, 'no order before the payment succeeds');

    stripe.succeed(intent.body.paymentIntentId, 'google_pay');
    const done = await shopper.json('/api/payments/complete', {
      method: 'POST',
      body: { paymentIntentId: intent.body.paymentIntentId },
    });
    assert.equal(done.status, 201);
    const { order } = done.body;
    assert.equal(order.paymentIntentId, intent.body.paymentIntentId);
    assert.equal(order.payment.brand, 'Google Pay');
    assert.equal(order.totals.totalCents, cart.totals.totalCents);
    assert.equal(order.promoCode, 'WOLF10');
    assert.equal(order.shippingMethod, 'express');
    assert.equal(order.shipping.city, 'Lupine Falls');
    assert.equal(order.email, 'wallet@wolfmart.test');

    const emptied = await shopper.json('/api/cart');
    assert.equal(emptied.body.cart.itemCount, 0, 'cart empties after purchase');

    const again = await shopper.json('/api/payments/complete', {
      method: 'POST',
      body: { paymentIntentId: intent.body.paymentIntentId },
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.order.number, order.number, 'a retry returns the same order');
    assert.equal(
      await app.prisma.order.count({
        where: { stripePaymentIntentId: intent.body.paymentIntentId },
      }),
      1,
    );

    const confirmation = await shopper.json(`/api/orders/${order.number}`);
    assert.equal(confirmation.body.order.paymentIntentId, intent.body.paymentIntentId);
    assert.equal(stripe.refunds.length, 0);
  });

  test('buy now: one item, the cart is left alone', async () => {
    const { shopper } = await shopperWith('cast-iron-skillet', 1);
    const { body } = await shopper.json('/api/products/howl-hoodie');
    const hoodie = body.product.variants.find((v) => v.stock > 0);

    const intent = await shopper.json('/api/payments/intent', {
      method: 'POST',
      body: {
        source: 'buy-now',
        variantId: hoodie.id,
        quantity: 2,
        shippingMethod: 'standard',
        ...WALLET,
      },
    });
    assert.equal(intent.status, 201);
    stripe.succeed(intent.body.paymentIntentId);
    const done = await shopper.json('/api/payments/complete', {
      method: 'POST',
      body: { paymentIntentId: intent.body.paymentIntentId },
    });
    assert.equal(done.status, 201);
    assert.equal(done.body.order.items.length, 1);
    assert.equal(done.body.order.items[0].quantity, 2);
    assert.equal(done.body.order.payment.brand, 'Apple Pay');
    assert.equal(done.body.order.totals.subtotalCents, hoodie.priceCents * 2);

    const cart = await shopper.json('/api/cart');
    assert.equal(cart.body.cart.itemCount, 1, 'buy now does not touch the cart');
  });

  test("another browser can't complete someone else's payment", async () => {
    const { shopper } = await shopperWith('cast-iron-skillet');
    const intent = await shopper.json('/api/payments/intent', {
      method: 'POST',
      body: { source: 'cart', shippingMethod: 'standard', ...WALLET },
    });
    stripe.succeed(intent.body.paymentIntentId);

    const stranger = await createClient(app.baseUrl).json('/api/payments/complete', {
      method: 'POST',
      body: { paymentIntentId: intent.body.paymentIntentId },
    });
    assert.equal(stranger.status, 404);
  });

  test('a paid amount that no longer matches is refunded, not ordered', async () => {
    const { shopper } = await shopperWith('cast-iron-skillet');
    const intent = await shopper.json('/api/payments/intent', {
      method: 'POST',
      body: { source: 'cart', shippingMethod: 'standard', ...WALLET },
    });
    stripe.intents.get(intent.body.paymentIntentId).amount -= 100;
    stripe.succeed(intent.body.paymentIntentId);

    const done = await shopper.json('/api/payments/complete', {
      method: 'POST',
      body: { paymentIntentId: intent.body.paymentIntentId },
    });
    assert.equal(done.status, 409);
    assert.equal(done.body.code, 'PRICE_CHANGED');
    assert.match(done.body.error, /refunded/);
    assert.deepEqual(
      stripe.refunds.map((r) => r.payment_intent),
      [intent.body.paymentIntentId],
    );
    const cart = await shopper.json('/api/cart');
    assert.equal(cart.body.cart.itemCount, 1, 'the cart is kept for another try');
  });

  test('bad input is refused before Stripe is called', async () => {
    const { shopper } = await shopperWith('cast-iron-skillet');
    const cases = [
      { source: 'cart', shippingMethod: 'overnight', ...WALLET },
      { source: 'cart', shippingMethod: 'standard', ...WALLET, email: 'nope' },
      { source: 'cart', shippingMethod: 'standard', email: WALLET.email, shipping: {} },
      { source: 'gift-card', shippingMethod: 'standard', ...WALLET },
    ];
    for (const body of cases) {
      const res = await shopper.json('/api/payments/intent', { method: 'POST', body });
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const empty = await createClient(app.baseUrl).json('/api/payments/intent', {
      method: 'POST',
      body: { source: 'cart', shippingMethod: 'standard', ...WALLET },
    });
    assert.equal(empty.status, 400);
    assert.equal(stripe.intents.size, 0);
  });

  test('the checkout chaos switches apply to wallets too', async () => {
    const { shopper } = await shopperWith('cast-iron-skillet');
    await app.setFlag('stock_race', true);
    try {
      const res = await shopper.json('/api/payments/intent', {
        method: 'POST',
        body: { source: 'cart', shippingMethod: 'standard', ...WALLET },
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'OUT_OF_STOCK');
      assert.equal(stripe.intents.size, 0, 'no charge is attempted');
    } finally {
      await app.setFlag('stock_race', false);
    }
  });
});

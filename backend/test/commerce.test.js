/**
 * The P1 promise, end to end over HTTP: a shopper can browse, fill a cart, and
 * complete a purchase — and only they can see the result.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, hasTestDatabase, startTestServer } from './helpers/server.js';

const SHIPPING = {
  name: 'Test Shopper',
  line1: '1 Test Way',
  city: 'Lupine Falls',
  region: 'OR',
  postalCode: '97000',
  country: 'US',
};

describe('commerce', { skip: !hasTestDatabase() && 'TEST_DATABASE_URL not set' }, () => {
  let app;
  before(async () => {
    app = await startTestServer();
  });
  after(() => app?.close());

  async function firstVariant(client, slug) {
    const { body } = await client.json(`/api/products/${slug}`);
    return body.product.variants.find((v) => v.stock > 0);
  }

  test('catalog search, filter, and sort', async () => {
    const client = createClient(app.baseUrl);
    const { status, body } = await client.json('/api/products?q=boot&sort=price_desc');
    assert.equal(status, 200);
    assert.ok(body.total >= 2);
    const prices = body.items.map((p) => p.priceFromCents);
    assert.deepEqual(
      prices,
      [...prices].sort((a, b) => b - a),
    );

    const kitchen = await client.json('/api/products?category=kitchen');
    assert.ok(kitchen.body.items.every((p) => p.category.slug === 'kitchen'));
  });

  test('a guest completes a purchase and sees the confirmation', async () => {
    const shopper = createClient(app.baseUrl);
    const variant = await firstVariant(shopper, 'cast-iron-skillet');

    const added = await shopper.json('/api/cart/items', {
      method: 'POST',
      body: { variantId: variant.id, quantity: 2 },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.cart.itemCount, 2);

    const promo = await shopper.json('/api/cart/promo', {
      method: 'POST',
      body: { code: 'wolf10' },
    });
    assert.equal(promo.body.cart.totals.discountCents, Math.round(variant.priceCents * 2 * 0.1));

    const placed = await shopper.json('/api/checkout', {
      method: 'POST',
      body: {
        email: 'guest@wolfmart.test',
        shipping: SHIPPING,
        shippingMethod: 'standard',
        paymentToken: 'tok_visa',
      },
    });
    assert.equal(placed.status, 201);
    const { order } = placed.body;
    assert.match(order.number, /^WM-\d{6}$/);
    assert.equal(order.payment.last4, '4242');

    const t = order.totals;
    assert.equal(t.totalCents, t.subtotalCents - t.discountCents + t.shippingCents + t.taxCents);

    const cart = await shopper.json('/api/cart');
    assert.equal(cart.body.cart.itemCount, 0, 'cart empties after purchase');

    const mine = await shopper.json(`/api/orders/${order.number}`);
    assert.equal(mine.status, 200);

    const stranger = await createClient(app.baseUrl).json(`/api/orders/${order.number}`);
    assert.equal(stranger.status, 404, 'another browser cannot read the order');

    const inbox = await shopper.json('/api/inbox');
    assert.ok(inbox.body.messages.some((m) => m.subject.includes(order.number)));
  });

  test('a declined demo card does not place an order', async () => {
    const shopper = createClient(app.baseUrl);
    const variant = await firstVariant(shopper, 'titanium-spork');
    await shopper.json('/api/cart/items', {
      method: 'POST',
      body: { variantId: variant.id, quantity: 1 },
    });
    const res = await shopper.json('/api/checkout', {
      method: 'POST',
      body: {
        email: 'a@wolfmart.test',
        shipping: SHIPPING,
        shippingMethod: 'express',
        paymentToken: 'tok_declined',
      },
    });
    assert.equal(res.status, 402);
    assert.equal((await shopper.json('/api/cart')).body.cart.itemCount, 1);
  });

  test('out-of-stock items cannot be added', async () => {
    const shopper = createClient(app.baseUrl);
    const { body } = await shopper.json('/api/products/snowpack-boot');
    const res = await shopper.json('/api/cart/items', {
      method: 'POST',
      body: { variantId: body.product.variants[0].id, quantity: 1 },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'OUT_OF_STOCK');
  });

  test('staff session requires the passphrase', async () => {
    const client = createClient(app.baseUrl);
    assert.equal((await client.json('/api/staff/session')).body.staff, false);
    const wrong = await client.json('/api/staff/session', {
      method: 'POST',
      body: { passphrase: 'nope' },
    });
    assert.equal(wrong.status, 401);
    const right = await client.json('/api/staff/session', {
      method: 'POST',
      body: { passphrase: process.env.DEMO_CONTROL_PASSPHRASE },
    });
    assert.equal(right.status, 200);
    assert.equal((await client.json('/api/staff/session')).body.staff, true);
  });
});

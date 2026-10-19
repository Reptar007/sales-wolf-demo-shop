/**
 * Plan §6.4: every chaos flag breaks exactly the flow it claims to, and only
 * while it is on. A flag that silently stopped working would turn a live demo
 * into "QA Wolf found nothing", so each one is pinned both ways.
 *
 * Also covers the control panel API that flips them.
 */

import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
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

const DEMO = { email: 'demo@wolfmart.test', password: 'WolfMart!2026' };

const FLAG_KEYS = [
  'checkout_500',
  'cart_total_drift',
  'search_latency',
  'login_flake',
  'stock_race',
  'image_404',
  'promo_expired',
];

const skip = !hasTestDatabase() && 'TEST_DATABASE_URL not set';

let app;
let authLimiter;
let staffLimiter;

before(async () => {
  if (skip) return;
  app = await startTestServer();
  // Same module instances the app uses, so resetting them frees the real limits.
  ({ authLimiter } = await import('../src/routes/auth.js'));
  ({ staffLimiter } = await import('../src/routes/staff.js'));
});
after(() => app?.close());

async function allFlagsOff() {
  for (const key of FLAG_KEYS) await app.setFlag(key, false);
}

/** A visitor with one in-stock skillet in their cart. */
async function shopperWithCart(quantity = 1) {
  const shopper = createClient(app.baseUrl);
  const { body } = await shopper.json('/api/products/cast-iron-skillet');
  const variant = body.product.variants.find((v) => v.stock >= quantity);
  const added = await shopper.json('/api/cart/items', {
    method: 'POST',
    body: { variantId: variant.id, quantity },
  });
  assert.equal(added.status, 201);
  return shopper;
}

const checkout = (client) =>
  client.json('/api/checkout', {
    method: 'POST',
    body: {
      email: 'chaos@wolfmart.test',
      shipping: SHIPPING,
      shippingMethod: 'standard',
      paymentToken: 'tok_visa',
    },
  });

async function timed(fn) {
  const started = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - started };
}

describe('chaos flags', { skip }, () => {
  beforeEach(allFlagsOff);
  afterEach(allFlagsOff);

  test('checkout_500: placing an order fails with a server error', async () => {
    await app.setFlag('checkout_500', true);
    const broken = await checkout(await shopperWithCart());
    assert.equal(broken.status, 500);
    assert.equal(broken.body.code, 'INTERNAL');

    await app.setFlag('checkout_500', false);
    const healthy = await checkout(await shopperWithCart());
    assert.equal(healthy.status, 201);
  });

  test('cart_total_drift: the total is $1 more than its parts', async () => {
    const shopper = await shopperWithCart(2);
    const sum = (t) => t.subtotalCents - t.discountCents + t.shippingCents + t.taxCents;

    const healthy = (await shopper.json('/api/cart')).body.cart.totals;
    assert.equal(healthy.totalCents, sum(healthy));

    await app.setFlag('cart_total_drift', true);
    const drifted = (await shopper.json('/api/cart')).body.cart.totals;
    assert.equal(drifted.totalCents, sum(drifted) + 100);
  });

  test('search_latency: searching takes 4s, browsing stays fast', { timeout: 20_000 }, async () => {
    const client = createClient(app.baseUrl);

    const fastSearch = await timed(() => client.json('/api/products?q=hoodie'));
    assert.equal(fastSearch.result.status, 200);
    assert.ok(fastSearch.ms < 2000, `healthy search took ${fastSearch.ms}ms`);

    await app.setFlag('search_latency', true);
    const browse = await timed(() => client.json('/api/products?category=apparel'));
    assert.equal(browse.result.status, 200);
    assert.ok(browse.ms < 2000, `browse without q took ${browse.ms}ms`);

    // The one slow call: the search still works, just too slowly.
    const slow = await timed(() => client.json('/api/products?q=hoodie'));
    assert.equal(slow.result.status, 200);
    assert.ok(slow.result.body.total >= 1);
    assert.ok(slow.ms >= 3950, `slow search took only ${slow.ms}ms`);
  });

  test('login_flake: some correct sign-ins fail, some succeed', async () => {
    async function signInBatch(n) {
      const statuses = [];
      for (let i = 0; i < n; i++) {
        authLimiter.reset(); // 30 attempts exceeds the 20/min limit by design
        const res = await createClient(app.baseUrl).json('/api/auth/signin', {
          method: 'POST',
          body: DEMO,
        });
        statuses.push(res.status);
      }
      return statuses;
    }

    const healthy = await signInBatch(10);
    assert.ok(
      healthy.every((s) => s === 200),
      `flag off: ${healthy.join(',')}`,
    );

    // At a 1-in-3 failure rate, 30 tries all landing on one side is ~1 in 190,000.
    await app.setFlag('login_flake', true);
    const flaky = await signInBatch(30);
    assert.ok(flaky.includes(401), 'with login_flake on, at least one sign-in fails');
    assert.ok(flaky.includes(200), 'with login_flake on, at least one sign-in succeeds');
    assert.ok(flaky.every((s) => s === 200 || s === 401));
    authLimiter.reset();
  });

  test('stock_race: the item adds to cart, then checkout says sold out', async () => {
    await app.setFlag('stock_race', true);
    const shopper = await shopperWithCart(); // asserts the add succeeds
    const cart = (await shopper.json('/api/cart')).body.cart;
    assert.ok(
      cart.items.every((i) => i.inStock),
      'the cart still says in stock',
    );

    const raced = await checkout(shopper);
    assert.equal(raced.status, 409);
    assert.equal(raced.body.code, 'OUT_OF_STOCK');
    assert.equal((await shopper.json('/api/cart')).body.cart.itemCount, 1, 'nothing was bought');

    await app.setFlag('stock_race', false);
    assert.equal((await checkout(shopper)).status, 201);
  });

  test('image_404: product images 404', async () => {
    const client = createClient(app.baseUrl);
    const path = '/api/images/products/howl-hoodie/1.svg';

    const healthy = await client.request(path);
    assert.equal(healthy.status, 200);
    assert.match(healthy.headers.get('content-type'), /image\/svg\+xml/);

    await app.setFlag('image_404', true);
    assert.equal((await client.request(path)).status, 404);
    // The page data itself still loads — only the asset is broken.
    assert.equal((await client.json('/api/products/howl-hoodie')).status, 200);
  });

  test('promo_expired: a valid code reads as applied but takes nothing off', async () => {
    const healthy = await (
      await shopperWithCart()
    ).json('/api/cart/promo', { method: 'POST', body: { code: 'WOLF20' } });
    assert.equal(healthy.status, 200);
    assert.ok(healthy.body.cart.totals.discountCents > 0);

    await app.setFlag('promo_expired', true);
    const silent = await (
      await shopperWithCart()
    ).json('/api/cart/promo', { method: 'POST', body: { code: 'WOLF20' } });
    assert.equal(silent.status, 200);
    assert.equal(silent.body.cart.promo.code, 'WOLF20');
    assert.equal(silent.body.cart.promo.problem, null, 'no error is shown to the shopper');
    assert.equal(silent.body.cart.totals.discountCents, 0);
  });
});

describe('demo control API', { skip }, () => {
  beforeEach(allFlagsOff);
  after(async () => {
    if (app) await allFlagsOff();
  });

  async function staffClient() {
    staffLimiter.reset();
    const client = createClient(app.baseUrl);
    const res = await client.json('/api/staff/session', {
      method: 'POST',
      body: { passphrase: process.env.DEMO_CONTROL_PASSPHRASE },
    });
    assert.equal(res.status, 200);
    return client;
  }

  test('every endpoint is staff-only', async () => {
    const stranger = createClient(app.baseUrl);
    const calls = [
      ['/api/demo-control/flags', {}],
      ['/api/demo-control/flags/checkout_500', { method: 'PATCH', body: { enabled: true } }],
      ['/api/demo-control/flags/reset', { method: 'POST', body: {} }],
      ['/api/demo-control/reset-data', { method: 'POST', body: { confirm: 'RESET' } }],
    ];
    for (const [path, options] of calls) {
      const res = await stranger.json(path, options);
      assert.equal(res.status, 401, `${options.method ?? 'GET'} ${path}`);
      assert.equal(res.body.code, 'STAFF_ONLY');
    }
    const flags = await app.prisma.chaosFlag.findMany({ where: { enabled: true } });
    assert.equal(flags.length, 0, 'nothing changed');
  });

  test('health shows which switches are on, without a staff session', async () => {
    const stranger = createClient(app.baseUrl);
    const clean = await stranger.json('/api/health');
    assert.equal(clean.status, 200);
    assert.deepEqual(clean.body.demoSwitchesOn, []);

    await app.setFlag('promo_expired', true);
    const dirty = await stranger.json('/api/health');
    assert.deepEqual(dirty.body.demoSwitchesOn, ['Valid promo silently rejected']);
  });

  test('lists every flag with its demo copy, in plan order', async () => {
    const se = await staffClient();
    const { status, body } = await se.json('/api/demo-control/flags');
    assert.equal(status, 200);
    assert.deepEqual(
      body.flags.map((f) => f.key),
      FLAG_KEYS,
    );
    for (const flag of body.flags) {
      assert.equal(flag.enabled, false);
      assert.ok(flag.label && flag.description && flag.proves, flag.key);
    }
  });

  test('a toggle takes effect on the very next request', async () => {
    const se = await staffClient();
    const on = await se.json('/api/demo-control/flags/checkout_500', {
      method: 'PATCH',
      body: { enabled: true },
    });
    assert.equal(on.status, 200);
    assert.equal(on.body.flag.enabled, true);
    assert.equal((await checkout(await shopperWithCart())).status, 500);

    const off = await se.json('/api/demo-control/flags/checkout_500', {
      method: 'PATCH',
      body: { enabled: false },
    });
    assert.equal(off.body.flag.enabled, false);
    assert.equal((await checkout(await shopperWithCart())).status, 201);
  });

  test('a toggle rejects unknown flags and non-boolean states', async () => {
    const se = await staffClient();
    const unknown = await se.json('/api/demo-control/flags/nope', {
      method: 'PATCH',
      body: { enabled: true },
    });
    assert.equal(unknown.status, 404);
    const vague = await se.json('/api/demo-control/flags/checkout_500', {
      method: 'PATCH',
      body: { enabled: 'yes' },
    });
    assert.equal(vague.status, 400);
  });

  test('reset all turns every flag off', async () => {
    const se = await staffClient();
    for (const key of ['checkout_500', 'image_404', 'promo_expired']) {
      await se.json(`/api/demo-control/flags/${key}`, {
        method: 'PATCH',
        body: { enabled: true },
      });
    }
    assert.equal(
      (await createClient(app.baseUrl).request('/api/images/products/howl-hoodie/1.svg')).status,
      404,
    );

    const res = await se.json('/api/demo-control/flags/reset', { method: 'POST', body: {} });
    assert.equal(res.status, 200);
    assert.ok(res.body.flags.every((f) => !f.enabled));
    assert.equal(
      (await createClient(app.baseUrl).request('/api/images/products/howl-hoodie/1.svg')).status,
      200,
      'the store is healthy again immediately',
    );
  });

  test('reset data requires an explicit confirm, then re-seeds', async () => {
    const se = await staffClient();
    const placed = await checkout(await shopperWithCart());
    assert.equal(placed.status, 201);
    await se.json('/api/demo-control/flags/image_404', {
      method: 'PATCH',
      body: { enabled: true },
    });

    for (const body of [{}, { confirm: 'reset' }, { confirm: true }]) {
      const refused = await se.json('/api/demo-control/reset-data', { method: 'POST', body });
      assert.equal(refused.status, 400, JSON.stringify(body));
    }
    assert.ok(await app.prisma.order.findUnique({ where: { number: placed.body.order.number } }));

    const res = await se.json('/api/demo-control/reset-data', {
      method: 'POST',
      body: { confirm: 'RESET' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(
      res.body.flags.every((f) => !f.enabled),
      'flags come back off',
    );
    assert.equal(
      await app.prisma.order.findUnique({ where: { number: placed.body.order.number } }),
      null,
      'orders placed since the last reset are gone',
    );
    assert.ok(await app.prisma.order.findUnique({ where: { number: 'WM-100001' } }));

    // The staff cookie is signed, not stored, so the SE stays unlocked.
    assert.equal((await se.json('/api/demo-control/flags')).status, 200);
  });
});

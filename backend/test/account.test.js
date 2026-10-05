/**
 * The P2 promise, end to end over HTTP: accounts, the guest-to-user cart merge,
 * order history, password reset through the demo inbox, and saved addresses —
 * each visible only to its owner.
 */

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, hasTestDatabase, startTestServer } from './helpers/server.js';

const PASSWORD = 'WolfMart!2026';

const SHIPPING = {
  name: 'Test Shopper',
  line1: '1 Test Way',
  city: 'Lupine Falls',
  region: 'OR',
  postalCode: '97000',
  country: 'US',
};

const ADDRESS = { label: 'Home', ...SHIPPING };

describe('accounts', { skip: !hasTestDatabase() && 'TEST_DATABASE_URL not set' }, () => {
  let app;
  let authLimiter;

  before(async () => {
    app = await startTestServer();
    ({ authLimiter } = await import('../src/routes/auth.js'));
  });
  after(() => app?.close());

  // Every client here is 127.0.0.1, so the per-IP auth limit is shared by the
  // whole file. Each test gets a fresh window.
  beforeEach(() => authLimiter.reset());

  const signIn = (client, email, password = PASSWORD) =>
    client.json('/api/auth/signin', { method: 'POST', body: { email, password } });

  async function addToCart(client, slug, quantity = 1) {
    const { body } = await client.json(`/api/products/${slug}`);
    const variant = body.product.variants.find((v) => v.stock >= quantity);
    const res = await client.json('/api/cart/items', {
      method: 'POST',
      body: { variantId: variant.id, quantity },
    });
    assert.equal(res.status, 201);
    return variant;
  }

  test('sign up, guest cart merges on sign-in, buy, see it in order history', async () => {
    const email = `new-${Date.now()}@wolfmart.test`;
    const first = createClient(app.baseUrl);
    const created = await first.json('/api/auth/signup', {
      method: 'POST',
      body: { name: 'Nova Newcomer', email, password: 'correct-horse' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.email, email);
    assert.equal((await first.json('/api/auth/me')).body.user.email, email);

    const dupe = await createClient(app.baseUrl).json('/api/auth/signup', {
      method: 'POST',
      body: { name: 'Again', email, password: 'correct-horse' },
    });
    assert.equal(dupe.status, 409);

    // A different browser shops as a guest, then signs in at checkout.
    const browser = createClient(app.baseUrl);
    const variant = await addToCart(browser, 'titanium-spork', 2);
    assert.equal((await signIn(browser, email, 'correct-horse')).status, 200);

    const cart = (await browser.json('/api/cart')).body.cart;
    assert.equal(cart.itemCount, 2, 'the guest cart followed the shopper into their account');
    assert.equal(cart.items[0].variant.id, variant.id);

    const placed = await browser.json('/api/checkout', {
      method: 'POST',
      body: { email, shipping: SHIPPING, shippingMethod: 'standard', paymentToken: 'tok_amex' },
    });
    assert.equal(placed.status, 201);

    // The first browser is signed in as the same account and sees the order too.
    const history = await first.json('/api/account/orders');
    assert.equal(history.status, 200);
    assert.deepEqual(
      history.body.orders.map((o) => o.number),
      [placed.body.order.number],
    );
    const detail = await first.json(`/api/account/orders/${placed.body.order.number}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.order.payment.brand, 'Amex');
  });

  test('a wrong password is a 401, and signing out ends the session', async () => {
    const client = createClient(app.baseUrl);
    const wrong = await signIn(client, 'demo@wolfmart.test', 'not-the-password');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');

    const unknown = await signIn(client, 'nobody@wolfmart.test');
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error, wrong.body.error, 'no account enumeration');

    assert.equal((await signIn(client, 'demo@wolfmart.test')).status, 200);
    await client.json('/api/auth/signout', { method: 'POST' });
    assert.equal((await client.json('/api/auth/me')).body.user, null);
    assert.equal((await client.json('/api/account/orders')).status, 401);
  });

  test('the seeded demo account has order history', async () => {
    const client = createClient(app.baseUrl);
    assert.equal((await signIn(client, 'demo@wolfmart.test')).status, 200);
    const { body } = await client.json('/api/account/orders');
    const numbers = body.orders.map((o) => o.number);
    assert.ok(numbers.includes('WM-100001'));
    assert.ok(numbers.includes('WM-100002'));
    assert.equal(numbers.indexOf('WM-100002') < numbers.indexOf('WM-100001'), true, 'newest first');

    const order = await client.json('/api/account/orders/WM-100001');
    assert.equal(order.status, 200);
    assert.equal(order.body.order.status, 'DELIVERED');

    // Another account can't read it.
    const other = createClient(app.baseUrl);
    await signIn(other, 'pack@wolfmart.test');
    assert.equal((await other.json('/api/account/orders/WM-100001')).status, 404);
  });

  test('each SE has their own account, history, and cart', async () => {
    const accounts = {
      'sebastian@wolfmart.test': ['WM-100011', 'WM-100012'],
      'ricky@wolfmart.test': ['WM-100021', 'WM-100022'],
      'jun@wolfmart.test': ['WM-100031', 'WM-100032'],
      'becca@wolfmart.test': ['WM-100041', 'WM-100042'],
      'dion@wolfmart.test': ['WM-100051', 'WM-100052'],
      'ian@wolfmart.test': ['WM-100061', 'WM-100062'],
    };
    const clients = {};
    for (const [email, expected] of Object.entries(accounts)) {
      const client = createClient(app.baseUrl);
      assert.equal((await signIn(client, email)).status, 200, email);
      const numbers = (await client.json('/api/account/orders')).body.orders.map((o) => o.number);
      assert.deepEqual(numbers.sort(), expected, `${email} sees only their own orders`);
      assert.equal((await client.json('/api/account/addresses')).body.addresses.length, 1);
      assert.equal((await client.json('/api/account/orders/WM-100001')).status, 404);
      clients[email] = client;
    }

    // One SE filling a cart doesn't touch another's.
    const { body } = await clients['ricky@wolfmart.test'].json('/api/products/titanium-spork');
    await clients['ricky@wolfmart.test'].json('/api/cart/items', {
      method: 'POST',
      body: { variantId: body.product.variants[0].id, quantity: 1 },
    });
    assert.equal((await clients['jun@wolfmart.test'].json('/api/cart')).body.cart.itemCount, 0);
  });

  test('password reset through the demo inbox', async () => {
    const email = 'alpha@wolfmart.test';
    const newPassword = 'a-brand-new-password';
    const requester = createClient(app.baseUrl);

    const forgot = await requester.json('/api/auth/password/forgot', {
      method: 'POST',
      body: { email },
    });
    assert.equal(forgot.status, 200);

    // Same answer for an account that doesn't exist.
    const ghost = await requester.json('/api/auth/password/forgot', {
      method: 'POST',
      body: { email: 'ghost@wolfmart.test' },
    });
    assert.deepEqual(ghost.body, forgot.body);

    const inbox = (await requester.json('/api/inbox')).body.messages;
    assert.equal(inbox.length, 1, 'only the real account got mail');
    const [message] = inbox;
    assert.equal(message.to, email);
    const match = /^\/reset-password\?token=([\w-]+)$/.exec(message.linkPath);
    assert.ok(match, `reset link: ${message.linkPath}`);
    const token = match[1];

    // Another visitor's inbox stays empty, even if they know the address.
    const stranger = createClient(app.baseUrl);
    assert.deepEqual((await stranger.json('/api/inbox')).body.messages, []);

    const tooShort = await requester.json('/api/auth/password/reset', {
      method: 'POST',
      body: { token, password: 'short' },
    });
    assert.equal(tooShort.status, 400);

    const reset = await requester.json('/api/auth/password/reset', {
      method: 'POST',
      body: { token, password: newPassword },
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.user.email, email, 'resetting signs you in');

    assert.equal((await signIn(createClient(app.baseUrl), email)).status, 401, 'old password');
    assert.equal(
      (await signIn(createClient(app.baseUrl), email, newPassword)).status,
      200,
      'new password',
    );

    const replay = await createClient(app.baseUrl).json('/api/auth/password/reset', {
      method: 'POST',
      body: { token, password: 'yet-another-password' },
    });
    assert.equal(replay.status, 400, 'the link is single-use');
    assert.equal(replay.body.code, 'RESET_INVALID');
    assert.equal((await signIn(createClient(app.baseUrl), email, newPassword)).status, 200);
  });

  test('addresses: CRUD with exactly one default', async () => {
    const client = createClient(app.baseUrl);
    assert.equal((await signIn(client, 'pack@wolfmart.test')).status, 200);
    const defaults = (addresses) => addresses.filter((a) => a.isDefault).map((a) => a.label);

    assert.deepEqual((await client.json('/api/account/addresses')).body.addresses, []);

    const first = await client.json('/api/account/addresses', { method: 'POST', body: ADDRESS });
    assert.equal(first.status, 201);
    assert.deepEqual(defaults(first.body.addresses), ['Home'], 'the first address is the default');
    const homeId = first.body.addresses[0].id;

    const second = await client.json('/api/account/addresses', {
      method: 'POST',
      body: { ...ADDRESS, label: 'Work', line1: '9 Office Park', isDefault: true },
    });
    assert.equal(second.body.addresses.length, 2);
    assert.deepEqual(defaults(second.body.addresses), ['Work'], 'a new default replaces the old');
    const workId = second.body.addresses.find((a) => a.label === 'Work').id;

    const invalid = await client.json('/api/account/addresses', {
      method: 'POST',
      body: { ...ADDRESS, city: '' },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.details.field, 'city');

    const updated = await client.json(`/api/account/addresses/${homeId}`, {
      method: 'PUT',
      body: { ...ADDRESS, line1: '2 Moved Lane', isDefault: true },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(defaults(updated.body.addresses), ['Home']);
    assert.equal(updated.body.addresses.find((a) => a.id === homeId).line1, '2 Moved Lane');

    // Editing the default without ticking "default" must not leave none.
    const edited = await client.json(`/api/account/addresses/${homeId}`, {
      method: 'PUT',
      body: { ...ADDRESS, line1: '3 Moved Again' },
    });
    assert.deepEqual(defaults(edited.body.addresses), ['Home']);

    // Someone else can't touch it.
    const other = createClient(app.baseUrl);
    await signIn(other, 'demo@wolfmart.test');
    const hijack = await other.json(`/api/account/addresses/${homeId}`, {
      method: 'PUT',
      body: ADDRESS,
    });
    assert.equal(hijack.status, 404);
    assert.equal(
      (await other.json(`/api/account/addresses/${homeId}`, { method: 'DELETE' })).status,
      404,
    );

    const removed = await client.json(`/api/account/addresses/${homeId}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.deepEqual(
      removed.body.addresses.map((a) => a.id),
      [workId],
    );
    assert.deepEqual(
      defaults(removed.body.addresses),
      ['Work'],
      'deleting the default promotes the next',
    );
  });

  test('account routes require a signed-in user', async () => {
    const anon = createClient(app.baseUrl);
    const calls = [
      ['/api/account/orders', {}],
      ['/api/account/orders/WM-100001', {}],
      ['/api/account/addresses', {}],
      ['/api/account/addresses', { method: 'POST', body: ADDRESS }],
      ['/api/account/profile', { method: 'PATCH', body: { name: 'Mallory' } }],
    ];
    for (const [path, options] of calls) {
      const res = await anon.json(path, options);
      assert.equal(res.status, 401, `${options.method ?? 'GET'} ${path}`);
    }
  });
});

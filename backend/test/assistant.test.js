/**
 * The P4 AI assistant, end to end over HTTP against a fake Anthropic API: real
 * SDK and tool runner, scripted model replies, seeded test database. Nothing
 * here touches the network or spends money.
 */

import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, hasTestDatabase, startTestServer } from './helpers/server.js';
import {
  createFakeAnthropic,
  readEvents,
  text,
  toolResults,
  toolUse,
} from './helpers/fakeAnthropic.js';
import {
  ToolInputError,
  parseAddToCartInput,
  parseOrderStatusInput,
  parseSearchInput,
  parseStockInput,
} from '../src/assistant/tools.js';
import { LIMITS, costMicros } from '../src/assistant/config.js';
import { historyFor } from '../src/assistant/service.js';

describe('assistant tool input validation', () => {
  test('search clamps and normalizes', () => {
    assert.deepEqual(
      parseSearchInput({ query: '  waterproof   jacket ', max_price: 150, in_stock: true }),
      { query: 'waterproof jacket', category: null, maxPriceCents: 15000, inStock: true },
    );
    assert.equal(parseSearchInput({ query: 'x'.repeat(500) }).query.length, 80);
    assert.equal(parseSearchInput({ max_price: 10_000_000 }).maxPriceCents, 10_000_000);
    assert.equal(parseSearchInput({ category: 'Kitchen' }).category, 'kitchen');
    assert.throws(() => parseSearchInput({ max_price: -1 }), ToolInputError);
    assert.throws(() => parseSearchInput({ max_price: 'cheap' }), ToolInputError);
    assert.throws(() => parseSearchInput({ category: '../../etc' }), ToolInputError);
    assert.throws(() => parseSearchInput({ query: { $ne: null } }), ToolInputError);
    assert.throws(() => parseSearchInput(null), ToolInputError);
    assert.throws(() => parseSearchInput([]), ToolInputError);
  });

  test('check_stock needs a slug-shaped slug', () => {
    assert.deepEqual(parseStockInput({ product_slug: 'Howl-Hoodie' }), { slug: 'howl-hoodie' });
    assert.throws(() => parseStockInput({}), ToolInputError);
    assert.throws(() => parseStockInput({ product_slug: 'a b' }), ToolInputError);
    assert.throws(() => parseStockInput({ product_slug: "x' OR 1=1" }), ToolInputError);
  });

  test('add_to_cart bounds quantity and requires a target', () => {
    assert.deepEqual(parseAddToCartInput({ product_slug: 'howl-hoodie', size: 'M' }), {
      slug: 'howl-hoodie',
      variantId: null,
      size: 'M',
      color: null,
      quantity: 1,
    });
    assert.equal(parseAddToCartInput({ variant_id: 'cabc123', quantity: 10 }).quantity, 10);
    assert.throws(() => parseAddToCartInput({}), ToolInputError);
    assert.throws(() => parseAddToCartInput({ product_slug: 'x', quantity: 0 }), ToolInputError);
    assert.throws(() => parseAddToCartInput({ product_slug: 'x', quantity: 11 }), ToolInputError);
    assert.throws(() => parseAddToCartInput({ product_slug: 'x', quantity: 1.5 }), ToolInputError);
    assert.throws(() => parseAddToCartInput({ variant_id: 'not-a-cuid!' }), ToolInputError);
  });

  test('get_order_status takes an optional WM- number', () => {
    assert.deepEqual(parseOrderStatusInput({}), { number: null });
    assert.deepEqual(parseOrderStatusInput({ order_number: 'wm-100001' }), {
      number: 'WM-100001',
    });
    assert.throws(() => parseOrderStatusInput({ order_number: '100001' }), ToolInputError);
  });

  test('cost is exact micro-dollars at the skill price for Opus 5', () => {
    // $5 / $25 per million tokens: 1,000 in + 100 out = 5,000 + 2,500 micros.
    assert.equal(costMicros('claude-opus-5', { input_tokens: 1000, output_tokens: 100 }), 7500);
    assert.equal(
      costMicros('claude-opus-5', {
        input_tokens: 0,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 1000,
        output_tokens: 0,
      }),
      6250 + 500,
    );
    // Unknown models are priced at the top rate, so the budget errs safe.
    assert.equal(costMicros('mystery-model', { input_tokens: 1000, output_tokens: 0 }), 10000);
  });

  test('history is bounded, text-only, and starts with the shopper', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: { text: `m${i}` },
    }));
    messages.push({ role: 'assistant', content: { text: 'oops', error: true } });
    const history = historyFor(messages);
    assert.ok(history.length <= LIMITS.historyMessages);
    assert.equal(history[0].role, 'user');
    assert.ok(history.every((m) => typeof m.content === 'string' && m.content !== 'oops'));
  });
});

describe('assistant API', { skip: !hasTestDatabase() && 'TEST_DATABASE_URL not set' }, () => {
  let app;
  let setFactory;
  let resetLimits;
  let messageLimiter;

  before(async () => {
    app = await startTestServer();
    ({ setAssistantClientFactory: setFactory } = await import('../src/assistant/client.js'));
    ({ resetLimits, messageLimiter } = await import('../src/assistant/limits.js'));
  });
  after(() => app?.close());

  beforeEach(async () => {
    resetLimits();
    await app.prisma.assistantSession.deleteMany();
  });
  afterEach(() => setFactory(() => null));

  function useFake(script) {
    const fake = createFakeAnthropic(script);
    setFactory(fake.client);
    return fake;
  }

  async function send(client, message, headers) {
    const response = await client.request('/api/assistant/messages', {
      method: 'POST',
      body: { message },
      headers,
    });
    return response;
  }

  test('without an API key it reports offline and refuses messages', async () => {
    setFactory(() => null);
    const client = createClient(app.baseUrl);
    const status = await client.json('/api/assistant/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.available, false);
    assert.equal(status.body.reason, 'not_configured');

    const res = await client.json('/api/assistant/messages', {
      method: 'POST',
      body: { message: 'hi' },
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'ASSISTANT_OFFLINE');

    const session = await client.json('/api/assistant/session');
    assert.deepEqual(session.body.messages, []);
  });

  test('streams a searched reply as SSE and records usage and cost', async () => {
    const fake = useFake([
      () => ({
        blocks: [
          text('Let me look.'),
          toolUse('search_products', { query: 'waterproof jacket', max_price: 150 }),
        ],
      }),
      () => ({ blocks: [text('The Alpha Rain Shell is $149.00 and fully waterproof.')] }),
    ]);
    const client = createClient(app.baseUrl);
    assert.equal((await client.json('/api/assistant/status')).body.available, true);

    const response = await send(client, 'Find a waterproof jacket under $150');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    const events = await readEvents(response);
    const names = events.map((e) => e.event);

    assert.ok(names.includes('text'));
    assert.deepEqual(
      events.filter((e) => e.event === 'tool').map((e) => [e.data.name, e.data.status]),
      [
        ['search_products', 'running'],
        ['search_products', 'done'],
      ],
    );
    assert.equal(events.find((e) => e.event === 'tool').data.label, 'Searching the catalog…');
    assert.equal(names.at(-1), 'done');

    const done = events.at(-1).data;
    assert.equal(done.role, 'assistant');
    assert.equal(
      events
        .filter((e) => e.event === 'text')
        .map((e) => e.data.delta)
        .join(''),
      done.text,
    );
    assert.deepEqual(done.products, [{ slug: 'alpha-rain-shell', name: 'Alpha Rain Shell' }]);

    // The model got real catalog data back from the tool.
    const [result] = toolResults(fake.requests[1]);
    assert.ok(!result.is_error);
    assert.match(result.content, /alpha-rain-shell/);

    // Request shape: bounded, low effort, the system prompt, all four tools.
    const body = fake.requests[0].body;
    assert.equal(body.model, 'claude-opus-5');
    assert.equal(body.max_tokens, LIMITS.maxTokens);
    assert.deepEqual(body.output_config, { effort: 'low' });
    assert.deepEqual(body.tools.map((t) => t.name).sort(), [
      'add_to_cart',
      'check_stock',
      'get_order_status',
      'search_products',
    ]);
    assert.match(body.system[0].text, /WolfMart/);

    const session = await app.prisma.assistantSession.findFirst();
    assert.equal(session.messageCount, 1);
    assert.equal(session.inputTokens, 2000);
    assert.equal(session.outputTokens, 200);
    assert.equal(session.costMicros, 2 * 7500);
    assert.match(session.ipHash, /^[0-9a-f]{64}$/);

    const transcript = await client.json('/api/assistant/session');
    assert.deepEqual(
      transcript.body.messages.map((m) => m.role),
      ['user', 'assistant'],
    );
  });

  test('add_to_cart adds to the requester’s own cart, within stock', async () => {
    const fake = useFake([
      () => ({
        blocks: [toolUse('add_to_cart', { product_slug: 'cast-iron-skillet', quantity: 2 })],
      }),
      () => ({ blocks: [text('Added two Cast Iron Skillets.')] }),
      () => ({ blocks: [toolUse('add_to_cart', { product_slug: 'snowpack-boot', size: '9' })] }),
      () => ({ blocks: [text('Sorry, that boot is out of stock.')] }),
    ]);
    const shopper = createClient(app.baseUrl);
    const stranger = createClient(app.baseUrl);

    const events = await readEvents(await send(shopper, 'Add two skillets to my cart'));
    const cartEvent = events.find((e) => e.event === 'cart');
    assert.equal(cartEvent.data.slug, 'cast-iron-skillet');
    assert.equal(cartEvent.data.cartItemCount, 2);
    assert.equal(events.at(-1).data.cartAdds.length, 1);

    assert.equal((await shopper.json('/api/cart')).body.cart.itemCount, 2);
    assert.equal((await stranger.json('/api/cart')).body.cart.itemCount, 0);

    const second = await readEvents(await send(shopper, 'Add the snowpack boot in size 9'));
    assert.ok(!second.some((e) => e.event === 'cart'));
    const [result] = toolResults(fake.requests[3]);
    assert.equal(result.is_error, true);
    assert.match(result.content, /out of stock/);
    assert.equal((await shopper.json('/api/cart')).body.cart.itemCount, 2);
  });

  test('add_to_cart asks which option when the product has several', async () => {
    const fake = useFake([
      () => ({ blocks: [toolUse('add_to_cart', { product_slug: 'howl-hoodie' })] }),
      () => ({ blocks: [text('Which size and color would you like?')] }),
    ]);
    const shopper = createClient(app.baseUrl);
    await readEvents(await send(shopper, 'Add the howl hoodie'));
    const [result] = toolResults(fake.requests[1]);
    assert.equal(result.is_error, true);
    assert.match(result.content, /several options/);
    assert.equal((await shopper.json('/api/cart')).body.cart.itemCount, 0);
  });

  test('check_stock returns variants with stock and price', async () => {
    const fake = useFake([
      () => ({ blocks: [toolUse('check_stock', { product_slug: 'pack-den-tent' })] }),
      () => ({ blocks: [text('Only 2 left of the Pack Den Tent.')] }),
    ]);
    await readEvents(await send(createClient(app.baseUrl), 'Is the tent in stock?'));
    const product = JSON.parse(toolResults(fake.requests[1])[0].content);
    assert.equal(product.slug, 'pack-den-tent');
    assert.ok(product.variants.length >= 1);
    assert.ok(product.variants.every((v) => v.stock === 2 && /^\$\d+\.\d\d$/.test(v.price)));
  });

  test('get_order_status refuses when signed out and only shows own orders', async () => {
    const script = () => ({ blocks: [toolUse('get_order_status', {})] });
    const fake = useFake([
      script,
      () => ({ blocks: [text('Please sign in.')] }),
      script,
      () => ({ blocks: [text('Here are your orders.')] }),
      () => ({ blocks: [toolUse('get_order_status', { order_number: 'WM-100001' })] }),
      () => ({ blocks: [text('No such order.')] }),
    ]);

    const guest = createClient(app.baseUrl);
    await readEvents(await send(guest, 'Where is my order?'));
    assert.match(toolResults(fake.requests[1])[0].content, /not signed in/);

    const dana = createClient(app.baseUrl);
    await dana.json('/api/auth/signin', {
      method: 'POST',
      body: { email: 'demo@wolfmart.test', password: 'WolfMart!2026' },
    });
    await readEvents(await send(dana, 'Where are my orders?'));
    const { orders } = JSON.parse(toolResults(fake.requests[3])[0].content);
    assert.deepEqual(orders.map((o) => o.number).sort(), ['WM-100001', 'WM-100002']);
    assert.ok(!JSON.stringify(orders).includes('Howling Ridge'), 'no shipping address');
    assert.ok(!JSON.stringify(orders).includes('@'), 'no email');

    const alex = createClient(app.baseUrl);
    await alex.json('/api/auth/signin', {
      method: 'POST',
      body: { email: 'alpha@wolfmart.test', password: 'WolfMart!2026' },
    });
    await readEvents(await send(alex, 'Where is WM-100001?'));
    assert.match(toolResults(fake.requests[5])[0].content, /No order WM-100001/);
  });

  test('caps tool round-trips per message', async () => {
    const fake = useFake([() => ({ blocks: [toolUse('search_products', { query: 'tent' })] })]);
    const events = await readEvents(await send(createClient(app.baseUrl), 'Search forever'));
    assert.equal(fake.requests.length, LIMITS.maxIterations);
    assert.match(events.at(-1).data.text, /more steps/);
  });

  test('rejects empty and over-long input', async () => {
    useFake([() => ({ blocks: [text('hi')] })]);
    const client = createClient(app.baseUrl);
    const empty = await client.json('/api/assistant/messages', {
      method: 'POST',
      body: { message: '   ' },
    });
    assert.equal(empty.status, 400);
    const long = await client.json('/api/assistant/messages', {
      method: 'POST',
      body: { message: 'x'.repeat(LIMITS.maxInputChars + 1) },
    });
    assert.equal(long.status, 400);
  });

  test('per-conversation cap, then start over', async () => {
    useFake([() => ({ blocks: [text('Hello!')] })]);
    const client = createClient(app.baseUrl);
    await readEvents(await send(client, 'hi'));
    await app.prisma.assistantSession.updateMany({
      data: { messageCount: LIMITS.maxMessagesPerConversation },
    });

    const capped = await client.json('/api/assistant/messages', {
      method: 'POST',
      body: { message: 'one more' },
    });
    assert.equal(capped.status, 429);
    assert.equal(capped.body.code, 'CONVERSATION_LIMIT');

    const reset = await client.json('/api/assistant/session/reset', { method: 'POST' });
    assert.equal(reset.status, 200);
    assert.deepEqual(reset.body.messages, []);
    const again = await send(client, 'hi again');
    assert.equal(again.status, 200);
    await again.text();
    assert.equal(await app.prisma.assistantSession.count(), 2, 'old session kept for the budget');
  });

  test('per-IP rate limit', async () => {
    useFake([() => ({ blocks: [text('Hello!')] })]);
    const ip = '203.0.113.9';
    // Trust proxy is one hop, so X-Forwarded-For sets req.ip in tests.
    for (let i = 0; i < LIMITS.maxMessagesPerIpPerHour; i += 1) messageLimiter.hit(ip);
    const res = await send(createClient(app.baseUrl), 'hi', { 'X-Forwarded-For': ip });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal((await res.json()).code, 'RATE_LIMITED');

    const other = await send(createClient(app.baseUrl), 'hi', {
      'X-Forwarded-For': '203.0.113.10',
    });
    assert.equal(other.status, 200);
    await other.text();
  });

  test('monthly budget ceiling disables the assistant', async () => {
    const fake = useFake([() => ({ blocks: [text('Hello!')] })]);
    await app.prisma.assistantSession.create({
      data: { visitorId: 'budget-test', ipHash: 'x', costMicros: 25_000_000 },
    });
    const client = createClient(app.baseUrl);
    const status = await client.json('/api/assistant/status');
    assert.equal(status.body.available, false);
    assert.equal(status.body.reason, 'budget_exhausted');

    const res = await client.json('/api/assistant/messages', {
      method: 'POST',
      body: { message: 'hi' },
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'ASSISTANT_BUDGET_EXHAUSTED');
    assert.equal(fake.requests.length, 0, 'no model call once over budget');

    // Spend from a previous month doesn't count.
    await app.prisma.$executeRawUnsafe(
      `UPDATE "AssistantSession" SET "updatedAt" = now() - interval '40 days'`,
    );
    assert.equal((await client.json('/api/assistant/status')).body.available, true);
  });

  test('a client disconnect aborts the model call', async () => {
    const fake = useFake([() => ({ hang: true })]);
    const client = createClient(app.baseUrl);
    const controller = new AbortController();
    const response = await fetch(`${app.baseUrl}/api/assistant/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: client.cookieHeader() },
      body: JSON.stringify({ message: 'hi' }),
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    const waitFor = async (condition) => {
      for (let i = 0; i < 100 && !condition(); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    await waitFor(() => fake.requests.length > 0); // the model call is in flight
    controller.abort();
    await waitFor(() => fake.state.aborted > 0);
    assert.equal(fake.state.aborted, 1);
  });

  test('one turn at a time per visitor', async () => {
    useFake([() => ({ hang: true })]);
    const client = createClient(app.baseUrl);
    await client.json('/api/assistant/session'); // get a visitor cookie
    const controller = new AbortController();
    const first = await fetch(`${app.baseUrl}/api/assistant/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: client.cookieHeader() },
      body: JSON.stringify({ message: 'hi' }),
      signal: controller.signal,
    });
    assert.equal(first.status, 200);
    const second = await client.json('/api/assistant/messages', {
      method: 'POST',
      body: { message: 'again' },
    });
    assert.equal(second.status, 409);
    controller.abort();
  });
});

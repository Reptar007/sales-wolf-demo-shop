/**
 * P3 live chat, end to end over real sockets: a shopper and an agent talk,
 * history survives, and nobody reaches a conversation that isn't theirs.
 */

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createClient, hasTestDatabase, startTestServer } from './helpers/server.js';

describe('live chat', { skip: !hasTestDatabase() && 'TEST_DATABASE_URL not set' }, () => {
  let app;
  let chatIo;
  let limiter;
  const sockets = [];

  before(async () => {
    app = await startTestServer();
    const chat = await import('../src/chat/socket.js');
    chatIo = chat.attachChat(app.server);
    limiter = chat.customerMessageLimiter;
  });

  beforeEach(() => limiter.reset());

  after(async () => {
    for (const s of sockets) s.disconnect();
    chatIo?.close();
    await app?.close();
  });

  /** A shopper with a visitor cookie (any /api request issues one). */
  async function visitor() {
    const client = createClient(app.baseUrl);
    await client.json('/api/chat/conversation');
    return client;
  }

  async function agent() {
    const client = await visitor();
    const unlocked = await client.json('/api/staff/session', {
      method: 'POST',
      body: { passphrase: process.env.DEMO_CONTROL_PASSPHRASE },
    });
    assert.equal(unlocked.status, 200);
    return client;
  }

  function socketFor(client, { origin = app.baseUrl, role, connectNow = true } = {}) {
    const socket = connect(app.baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      autoConnect: connectNow,
      auth: role ? { role } : {},
      extraHeaders: { Cookie: client.cookieHeader(), Origin: origin },
    });
    sockets.push(socket);
    return socket;
  }

  const connected = (socket) =>
    new Promise((resolve, reject) => {
      if (socket.connected) return resolve(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const nextEvent = (socket, event, predicate = () => true, ms = 3000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`timed out waiting for ${event}`));
      }, ms);
      function handler(payload) {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
      socket.on(event, handler);
    });

  const emit = (socket, event, payload) => socket.timeout(3000).emitWithAck(event, payload);

  test('customer and agent round trip, with typing and unread counts', async () => {
    const shopper = await visitor();
    const staff = await agent();
    const customerSocket = await connected(socketFor(shopper));
    const agentSocket = await connected(socketFor(staff, { role: 'agent' }));

    const agentSees = nextEvent(agentSocket, 'chat:message', (m) => m.sender === 'CUSTOMER');
    const sent = await emit(customerSocket, 'customer:message', { body: '  Where is my order?  ' });
    assert.equal(sent.ok, true);
    assert.deepEqual(
      sent.messages.map((m) => [m.sender, m.body]),
      [
        ['CUSTOMER', 'Where is my order?'],
        ['SYSTEM', 'Thanks! An agent will be with you shortly.'],
      ],
    );
    const conversationId = sent.conversation.id;
    assert.equal(sent.conversation.customerName, 'Guest');
    assert.equal(sent.conversation.agentUnread, 1);
    assert.equal(sent.conversation.visitorId, undefined, 'visitor cookie never leaves the server');
    assert.equal((await agentSees).conversationId, conversationId);

    // Customer typing reaches the agent, and vice versa.
    const agentTyping = nextEvent(agentSocket, 'chat:typing', (t) => t.typing);
    await emit(customerSocket, 'customer:typing', { typing: true });
    assert.deepEqual(await agentTyping, { conversationId, sender: 'CUSTOMER', typing: true });

    const customerTyping = nextEvent(customerSocket, 'chat:typing', (t) => t.typing);
    await emit(agentSocket, 'agent:typing', { conversationId, typing: true });
    assert.equal((await customerTyping).sender, 'AGENT');

    const list = await staff.json('/api/chat/agent/conversations');
    assert.equal(list.status, 200);
    const row = list.body.conversations.find((c) => c.id === conversationId);
    assert.equal(row.agentUnread, 1);
    assert.equal(row.lastMessage.sender, 'SYSTEM');

    const read = await emit(agentSocket, 'agent:read', { conversationId });
    assert.equal(read.conversation.agentUnread, 0);

    const customerSees = nextEvent(customerSocket, 'chat:message', (m) => m.sender === 'AGENT');
    const reply = await emit(agentSocket, 'agent:message', {
      conversationId,
      body: 'It ships tomorrow.',
    });
    assert.equal(reply.ok, true);
    assert.equal((await customerSees).body, 'It ships tomorrow.');

    let mine = await shopper.json('/api/chat/conversation');
    assert.equal(mine.body.conversation.customerUnread, 1);
    await emit(customerSocket, 'customer:read');
    mine = await shopper.json('/api/chat/conversation');
    assert.equal(mine.body.conversation.customerUnread, 0);
  });

  test('a signed-in shopper is named; messages are validated and rate limited', async () => {
    const shopper = await visitor();
    const signup = await shopper.json('/api/auth/signup', {
      method: 'POST',
      body: {
        name: 'Robin Chat',
        email: `chat-${Date.now()}@wolfmart.test`,
        password: 'hunter22!',
      },
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    const socket = await connected(socketFor(shopper));

    const empty = await emit(socket, 'customer:message', { body: '   ' });
    assert.equal(empty.ok, false);
    assert.equal(empty.code, 'BAD_REQUEST');

    const long = await emit(socket, 'customer:message', { body: 'x'.repeat(1001) });
    assert.equal(long.ok, false);

    const first = await emit(socket, 'customer:message', { body: 'hello' });
    assert.equal(first.conversation.customerName, 'Robin Chat');

    for (let i = 1; i < 20; i += 1) {
      assert.equal((await emit(socket, 'customer:message', { body: `m${i}` })).ok, true);
    }
    const limited = await emit(socket, 'customer:message', { body: 'one too many' });
    assert.equal(limited.code, 'RATE_LIMITED');
  });

  test("a customer can't read or write another visitor's conversation", async () => {
    const alice = await visitor();
    const mallory = await visitor();
    const aliceSocket = await connected(socketFor(alice));
    const mallorySocket = await connected(socketFor(mallory));

    let leaked = false;
    mallorySocket.on('chat:message', () => (leaked = true));
    mallorySocket.on('chat:conversation', () => (leaked = true));

    const sent = await emit(aliceSocket, 'customer:message', { body: 'my secret order' });
    const conversationId = sent.conversation.id;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(leaked, false, "another visitor's socket saw the message");

    assert.equal((await mallory.json('/api/chat/conversation')).body.conversation, null);
    assert.equal(
      (await mallory.json(`/api/chat/agent/conversations/${conversationId}`)).status,
      401,
    );
    assert.equal((await mallory.json('/api/chat/agent/conversations')).status, 401);

    // Customer events take no conversation id, so a forged one is just ignored.
    await emit(mallorySocket, 'customer:message', { conversationId, body: 'hi from mallory' });
    const aliceView = await alice.json('/api/chat/conversation');
    assert.ok(aliceView.body.conversation.messages.every((m) => m.body !== 'hi from mallory'));
  });

  test('agent events need the staff cookie', async () => {
    const shopper = await visitor();
    const socket = await connected(socketFor(shopper));
    const sent = await emit(socket, 'customer:message', { body: 'hi' });
    const conversationId = sent.conversation.id;

    for (const event of ['agent:message', 'agent:close', 'agent:read', 'agent:typing']) {
      const result = await emit(socket, event, { conversationId, body: 'impersonating' });
      assert.equal(result.ok, false, event);
      assert.equal(result.code, 'STAFF_ONLY', event);
    }

    // Asking for the agent role without the cookie is refused at the handshake.
    await assert.rejects(connected(socketFor(shopper, { role: 'agent' })), /STAFF_ONLY/);

    const after = await shopper.json('/api/chat/conversation');
    assert.equal(after.body.conversation.status, 'OPEN');
    assert.ok(after.body.conversation.messages.every((m) => m.sender !== 'AGENT'));
  });

  test('handshakes are refused from a foreign Origin or without a visitor cookie', async () => {
    const shopper = await visitor();
    await assert.rejects(connected(socketFor(shopper, { origin: 'https://evil.example' })));
    await assert.rejects(connected(socketFor(createClient(app.baseUrl))), /visitor cookie/);
  });

  test('history persists, closing ends the chat, and the next message starts a new one', async () => {
    const shopper = await visitor();
    const staff = await agent();
    const socket = await connected(socketFor(shopper));
    const agentSocket = await connected(socketFor(staff, { role: 'agent' }));

    const first = await emit(socket, 'customer:message', { body: 'first' });
    await emit(agentSocket, 'agent:message', {
      conversationId: first.conversation.id,
      body: 'reply',
    });
    socket.disconnect();

    // "Reload": a fresh request and socket see the whole history.
    const history = await shopper.json('/api/chat/conversation');
    assert.deepEqual(
      history.body.conversation.messages.map((m) => m.body),
      ['first', 'Thanks! An agent will be with you shortly.', 'reply'],
    );

    const again = await connected(socketFor(shopper));
    const closedSeen = nextEvent(again, 'chat:conversation', (c) => c.status === 'CLOSED');
    const closed = await emit(agentSocket, 'agent:close', {
      conversationId: first.conversation.id,
    });
    assert.equal(closed.conversation.status, 'CLOSED');
    await closedSeen;

    const refused = await emit(agentSocket, 'agent:message', {
      conversationId: first.conversation.id,
      body: 'too late',
    });
    assert.equal(refused.code, 'CHAT_CLOSED');
    assert.equal((await shopper.json('/api/chat/conversation')).body.conversation, null);

    const fresh = await emit(again, 'customer:message', { body: 'new question' });
    assert.notEqual(fresh.conversation.id, first.conversation.id);
    assert.equal(fresh.messages.length, 2, 'a new chat gets its own welcome message');
  });

  test('a dropped customer socket recovers messages sent while it was away', async () => {
    const shopper = await visitor();
    const staff = await agent();
    const socket = await connected(socketFor(shopper));
    const agentSocket = await connected(socketFor(staff, { role: 'agent' }));

    const sent = await emit(socket, 'customer:message', { body: 'still there?' });
    const conversationId = sent.conversation.id;

    socket.disconnect();
    await emit(agentSocket, 'agent:message', { conversationId, body: 'sent while you were away' });

    // What the widget does on 'connect': rejoin, then refetch.
    socket.connect();
    await connected(socket);
    const refetched = await shopper.json('/api/chat/conversation');
    assert.equal(refetched.body.conversation.messages.at(-1).body, 'sent while you were away');
    assert.equal(refetched.body.conversation.customerUnread, 1);

    // And live delivery resumes on the reconnected socket.
    const live = nextEvent(socket, 'chat:message', (m) => m.sender === 'AGENT');
    await emit(agentSocket, 'agent:message', { conversationId, body: 'welcome back' });
    assert.equal((await live).body, 'welcome back');

    const detail = await staff.json(`/api/chat/agent/conversations/${conversationId}`);
    assert.equal(detail.body.conversation.messages.length, 4);
  });
});

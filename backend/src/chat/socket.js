/**
 * The live chat socket server, attached to the HTTP server index.js already
 * listens on (after the egress allowlist is installed).
 *
 * Rooms:
 *   visitor:<visitorId>  every tab of one shopper. A visitor has at most one
 *                        open conversation, so this is that conversation's
 *                        customer room. Joined synchronously on connect, so a
 *                        client that refetches on 'connect' cannot miss a message.
 *   agents               every staff socket; sees all conversations.
 *
 * Identity comes only from handshake cookies (same cookies the REST API uses),
 * never from anything the client puts in an event payload.
 */

import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { SESSION_COOKIE, VISITOR_COOKIE, readSession } from '../http/identity.js';
import { STAFF_COOKIE, isStaffToken } from '../http/staff.js';
import { HttpError } from '../http/errors.js';
import { createLimiter } from '../http/rateLimit.js';
import * as chat from './service.js';

const VISITOR_ID = /^[0-9a-f-]{36}$/;
const AGENTS = 'agents';
const visitorRoom = (visitorId) => `visitor:${visitorId}`;

// Per visitor, not per socket: opening more tabs must not buy more messages.
export const customerMessageLimiter = createLimiter({ windowMs: 60_000, max: 20 });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Cross-site WebSocket hijacking guard: a browser always sends Origin on a
 * WebSocket handshake, and a page on another site would send its own. Only
 * same-host origins get through. In development the Vite proxy rewrites Host to
 * the backend port, so localhost-to-localhost is also accepted there.
 */
export function originAllowed(origin, host) {
  if (!origin || !host) return false;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (originHost === host) return true;
  if (process.env.NODE_ENV === 'production') return false;
  const hostname = (h) => h.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(hostname(originHost)) && LOCAL_HOSTS.has(hostname(host));
}

function identify(req) {
  const cookies = parseCookie(req.headers.cookie ?? '');
  const visitorId = cookies[VISITOR_COOKIE];
  if (!visitorId || !VISITOR_ID.test(visitorId)) return null;
  return {
    visitorId,
    user: readSession(cookies[SESSION_COOKIE]),
    staff: isStaffToken(cookies[STAFF_COOKIE]),
  };
}

/** Turns a thrown error into an ack payload the client can show. */
function failure(error) {
  if (error instanceof HttpError) return { ok: false, error: error.message, code: error.code };
  console.error('Chat socket error:', error);
  return { ok: false, error: 'Something went wrong on our end.', code: 'INTERNAL' };
}

/** Registers an event whose handler may throw; replies through the ack if given. */
function on(socket, event, handler) {
  socket.on(event, async (payload, ack) => {
    if (typeof payload === 'function') [payload, ack] = [undefined, payload];
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...(await handler(payload ?? {})) });
    } catch (error) {
      reply(failure(error));
    }
  });
}

const staffOnly = () => new HttpError(401, 'STAFF_ONLY', 'Enter the demo passphrase.');

export function attachChat(httpServer) {
  const io = new Server(httpServer, {
    serveClient: false,
    // WebSocket only: the handshake always carries Origin, which the guard
    // below depends on (same-origin polling GETs may omit it).
    transports: ['websocket'],
    maxHttpBufferSize: 16 * 1024,
    allowRequest(req, callback) {
      if (!originAllowed(req.headers.origin, req.headers.host)) {
        return callback('Origin not allowed', false);
      }
      callback(null, true);
    },
  });

  io.use((socket, next) => {
    const who = identify(socket.request);
    if (!who) return next(new Error('Missing visitor cookie. Load the page first.'));
    if (socket.handshake.auth?.role === 'agent' && !who.staff) {
      return next(new Error('STAFF_ONLY'));
    }
    socket.data = who;
    next();
  });

  /** Sends to the customer's tabs and to every agent (deduped by socket.io). */
  const toBoth = (visitorId) => io.to([visitorRoom(visitorId), AGENTS]);

  io.on('connection', (socket) => {
    const { visitorId } = socket.data;
    // One SE often plays both sides from one browser, so the same cookies show
    // up on the widget and the console. `auth.role` only picks which side this
    // socket plays; the agent side still needs the staff cookie.
    // (The middleware above already refused role=agent without staff.)
    const staff = socket.data.staff && socket.handshake.auth?.role === 'agent';
    if (staff) socket.join(AGENTS);
    else socket.join(visitorRoom(visitorId));

    // ── Customer events ──────────────────────────────────────────────────────

    on(socket, 'customer:message', async ({ body }) => {
      chat.cleanBody(body); // Malformed sends don't spend the visitor's quota.
      const limit = customerMessageLimiter.hit(visitorId);
      if (!limit.ok) {
        throw new HttpError(
          429,
          'RATE_LIMITED',
          'You’re sending messages too fast. Give it a minute.',
        );
      }
      const result = await chat.sendCustomerMessage({ visitorId, user: socket.data.user, body });
      for (const message of result.messages) toBoth(visitorId).emit('chat:message', message);
      toBoth(visitorId).emit('chat:conversation', result.conversation);
      io.to(AGENTS).emit('chat:typing', {
        conversationId: result.conversation.id,
        sender: 'CUSTOMER',
        typing: false,
      });
      return { conversation: result.conversation, messages: result.messages };
    });

    on(socket, 'customer:typing', async ({ typing }) => {
      const conversationId = await chat.openConversationId(visitorId);
      if (conversationId) {
        io.to(AGENTS).emit('chat:typing', {
          conversationId,
          sender: 'CUSTOMER',
          typing: Boolean(typing),
        });
      }
      return {};
    });

    on(socket, 'customer:read', async () => {
      const conversation = await chat.markCustomerRead(visitorId);
      if (conversation) io.to(visitorRoom(visitorId)).emit('chat:conversation', conversation);
      return {};
    });

    // ── Agent events (staff cookie required) ─────────────────────────────────

    const agentOn = (event, handler) =>
      on(socket, event, (payload) => {
        if (!staff) throw staffOnly();
        return handler(payload);
      });

    agentOn('agent:message', async ({ conversationId, body }) => {
      const result = await chat.sendAgentMessage({ conversationId, body });
      toBoth(result.visitorId).emit('chat:message', result.message);
      toBoth(result.visitorId).emit('chat:conversation', result.conversation);
      io.to(visitorRoom(result.visitorId)).emit('chat:typing', {
        conversationId: result.conversation.id,
        sender: 'AGENT',
        typing: false,
      });
      return { conversation: result.conversation, message: result.message };
    });

    agentOn('agent:typing', async ({ conversationId, typing }) => {
      const target = await chat.findConversationTarget(conversationId);
      if (target.status === 'OPEN') {
        io.to(visitorRoom(target.visitorId)).emit('chat:typing', {
          conversationId: target.id,
          sender: 'AGENT',
          typing: Boolean(typing),
        });
      }
      return {};
    });

    agentOn('agent:read', async ({ conversationId }) => {
      const result = await chat.markAgentRead(conversationId);
      io.to(AGENTS).emit('chat:conversation', result.conversation);
      return { conversation: result.conversation };
    });

    agentOn('agent:close', async ({ conversationId }) => {
      const result = await chat.closeConversation(conversationId);
      if (result.message) toBoth(result.visitorId).emit('chat:message', result.message);
      toBoth(result.visitorId).emit('chat:conversation', result.conversation);
      io.to(visitorRoom(result.visitorId)).emit('chat:typing', {
        conversationId: result.conversation.id,
        sender: 'AGENT',
        typing: false,
      });
      return { conversation: result.conversation };
    });
  });

  return io;
}

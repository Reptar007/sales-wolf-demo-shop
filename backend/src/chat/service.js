/**
 * Live chat persistence. Both the socket server and the REST routes go through
 * here, so "who may see what" lives in one place:
 *
 *   - customers are addressed only by visitorId, never by a conversation id
 *     they supply, so they cannot reach another visitor's chat;
 *   - agent functions take a conversation id and are only ever called behind
 *     a staff check.
 *
 * Serialized conversations never include visitorId: it is the shopper's cookie
 * value, and nobody (agents included) needs to see it.
 */

import { prisma } from '../db.js';
import { badRequest, conflict, notFound } from '../http/errors.js';

export const MAX_MESSAGE_LENGTH = 1000;
export const WELCOME_MESSAGE = 'Thanks! An agent will be with you shortly.';
export const CLOSED_MESSAGE = 'This chat was closed by the agent.';

/** Trims and validates a message body, or throws a shopper-safe 400. */
export function cleanBody(raw) {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) throw badRequest('Type a message first.', { field: 'body' });
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw badRequest(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`, {
      field: 'body',
    });
  }
  return body;
}

export function serializeMessage(m) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    sender: m.sender,
    body: m.body,
    createdAt: m.createdAt,
  };
}

export function serializeConversation(c, { messages, lastMessage } = {}) {
  const out = {
    id: c.id,
    customerName: c.customerName,
    status: c.status,
    agentUnread: c.agentUnread,
    customerUnread: c.customerUnread,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
  };
  if (lastMessage !== undefined) out.lastMessage = lastMessage && serializeMessage(lastMessage);
  if (messages) out.messages = messages.map(serializeMessage);
  return out;
}

const withMessages = { messages: { orderBy: { createdAt: 'asc' } } };
const withLastMessage = { messages: { orderBy: { createdAt: 'desc' }, take: 1 } };

function summary(c) {
  return serializeConversation(c, { lastMessage: c.messages?.[0] ?? null });
}

// ── Customer side (by visitorId only) ────────────────────────────────────────

/** The visitor's open conversation with its messages, or null. */
export async function getCustomerConversation(visitorId) {
  const c = await prisma.chatConversation.findFirst({
    where: { visitorId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    include: withMessages,
  });
  return c ? serializeConversation(c, { messages: c.messages }) : null;
}

// Two quick first messages must not open two conversations, so sends are
// serialized per visitor. One dyno, so an in-memory chain is enough.
const visitorQueues = new Map();

function serialPerVisitor(visitorId, task) {
  const previous = visitorQueues.get(visitorId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const settled = run.catch(() => {});
  visitorQueues.set(visitorId, settled);
  settled.then(() => {
    if (visitorQueues.get(visitorId) === settled) visitorQueues.delete(visitorId);
  });
  return run;
}

/**
 * Appends a customer message to the visitor's open conversation, opening one
 * (plus the welcome SYSTEM message) if there is none.
 * Returns { conversation (summary), messages (new, in order), created }.
 */
export function sendCustomerMessage({ visitorId, user, body }) {
  const text = cleanBody(body);
  return serialPerVisitor(visitorId, () =>
    prisma.$transaction(async (tx) => {
      let conversation = await tx.chatConversation.findFirst({
        where: { visitorId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      });
      const created = !conversation;
      if (created) {
        conversation = await tx.chatConversation.create({
          data: { visitorId, userId: user?.id ?? null, customerName: user?.name || 'Guest' },
        });
      }

      const messages = [
        await tx.chatMessage.create({
          data: { conversationId: conversation.id, sender: 'CUSTOMER', body: text },
        }),
      ];
      if (created) {
        messages.push(
          await tx.chatMessage.create({
            data: {
              conversationId: conversation.id,
              sender: 'SYSTEM',
              body: WELCOME_MESSAGE,
              // One ms later, so history never sorts the reply above the question.
              createdAt: new Date(messages[0].createdAt.getTime() + 1),
            },
          }),
        );
      }

      const updated = await tx.chatConversation.update({
        where: { id: conversation.id },
        data: { agentUnread: { increment: 1 }, lastMessageAt: messages.at(-1).createdAt },
        include: withLastMessage,
      });
      return { conversation: summary(updated), messages: messages.map(serializeMessage), created };
    }),
  );
}

/** Clears the customer's unread count; returns the summary, or null if nothing changed. */
export async function markCustomerRead(visitorId) {
  const c = await prisma.chatConversation.findFirst({
    where: { visitorId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });
  if (!c || c.customerUnread === 0) return null;
  const updated = await prisma.chatConversation.update({
    where: { id: c.id },
    data: { customerUnread: 0 },
    include: withLastMessage,
  });
  return summary(updated);
}

/** The id of the visitor's open conversation, or null. Used to route typing. */
export async function openConversationId(visitorId) {
  const c = await prisma.chatConversation.findFirst({
    where: { visitorId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return c?.id ?? null;
}

// ── Agent side (staff only — callers check) ──────────────────────────────────

export async function listConversations() {
  const rows = await prisma.chatConversation.findMany({
    orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
    take: 100,
    include: withLastMessage,
  });
  return rows.map(summary);
}

export async function getConversation(id) {
  const c = await prisma.chatConversation.findUnique({
    where: { id: String(id) },
    include: withMessages,
  });
  if (!c) throw notFound('Conversation not found.');
  return serializeConversation(c, { messages: c.messages, lastMessage: c.messages.at(-1) ?? null });
}

/** Returns the visitorId too, so the socket layer can address the customer. */
async function findForAgent(tx, id) {
  const c = await tx.chatConversation.findUnique({ where: { id: String(id ?? '') } });
  if (!c) throw notFound('Conversation not found.');
  return c;
}

/** Just enough to route an agent's typing indicator to the right customer. */
export async function findConversationTarget(conversationId) {
  const c = await findForAgent(prisma, conversationId);
  return { id: c.id, visitorId: c.visitorId, status: c.status };
}

export async function sendAgentMessage({ conversationId, body }) {
  const text = cleanBody(body);
  return prisma.$transaction(async (tx) => {
    const c = await findForAgent(tx, conversationId);
    if (c.status !== 'OPEN') throw conflict('CHAT_CLOSED', 'This conversation is closed.');
    const message = await tx.chatMessage.create({
      data: { conversationId: c.id, sender: 'AGENT', body: text },
    });
    const updated = await tx.chatConversation.update({
      where: { id: c.id },
      data: { customerUnread: { increment: 1 }, lastMessageAt: message.createdAt },
      include: withLastMessage,
    });
    return {
      visitorId: c.visitorId,
      conversation: summary(updated),
      message: serializeMessage(message),
    };
  });
}

export async function markAgentRead(conversationId) {
  const c = await findForAgent(prisma, conversationId);
  const updated = await prisma.chatConversation.update({
    where: { id: c.id },
    data: { agentUnread: 0 },
    include: withLastMessage,
  });
  return { visitorId: c.visitorId, conversation: summary(updated) };
}

/** Closes a conversation and posts a SYSTEM note so both sides see why. */
export async function closeConversation(conversationId) {
  return prisma.$transaction(async (tx) => {
    const c = await findForAgent(tx, conversationId);
    if (c.status === 'CLOSED') {
      const same = await tx.chatConversation.findUnique({
        where: { id: c.id },
        include: withLastMessage,
      });
      return { visitorId: c.visitorId, conversation: summary(same), message: null };
    }
    const message = await tx.chatMessage.create({
      data: { conversationId: c.id, sender: 'SYSTEM', body: CLOSED_MESSAGE },
    });
    const updated = await tx.chatConversation.update({
      where: { id: c.id },
      data: { status: 'CLOSED', lastMessageAt: message.createdAt },
      include: withLastMessage,
    });
    return {
      visitorId: c.visitorId,
      conversation: summary(updated),
      message: serializeMessage(message),
    };
  });
}

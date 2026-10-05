/**
 * The AI shopping assistant (plan §6.3).
 *
 *   GET  /api/assistant/status         is it available, and if not, why
 *   GET  /api/assistant/session        this visitor's current transcript
 *   POST /api/assistant/session/reset  start a new conversation
 *   POST /api/assistant/messages       send a message; the reply streams back as
 *                                      Server-Sent Events on this response
 *
 * Public and paid per message, so every request runs the gauntlet in order:
 * API key configured → monthly budget left → valid input → conversation cap →
 * per-IP rate limit → one turn at a time per visitor.
 */

import express from 'express';
import { HttpError, badRequest } from '../http/errors.js';
import { ownerOf } from '../commerce/cart.js';
import { getAssistantClient } from '../assistant/client.js';
import { LIMITS } from '../assistant/config.js';
import {
  budgetExhausted,
  claimTurn,
  hashIp,
  messageLimiter,
  releaseTurn,
  resetLimiter,
} from '../assistant/limits.js';
import {
  currentSession,
  ensureSession,
  runTurn,
  serializeMessage,
  startOver,
} from '../assistant/service.js';

const router = express.Router();

const OFFLINE_MESSAGE =
  'The WolfMart assistant is offline right now. Browse or search the store instead.';
const BUDGET_MESSAGE =
  'The WolfMart assistant is resting until next month. Browse or search the store instead.';

async function availability() {
  if (!getAssistantClient()) return { available: false, reason: 'not_configured' };
  if (await budgetExhausted()) return { available: false, reason: 'budget_exhausted' };
  return { available: true, reason: null };
}

function unavailableError(reason) {
  return reason === 'budget_exhausted'
    ? new HttpError(503, 'ASSISTANT_BUDGET_EXHAUSTED', BUDGET_MESSAGE)
    : new HttpError(503, 'ASSISTANT_OFFLINE', OFFLINE_MESSAGE);
}

function sessionKeys(req) {
  return { visitorId: req.visitorId, ipHash: hashIp(req.ip), userId: req.user?.id ?? null };
}

function rateLimited(res, result, message) {
  res.setHeader('Retry-After', Math.ceil(result.retryAfterMs / 1000));
  return new HttpError(429, 'RATE_LIMITED', message);
}

function transcript(session) {
  return {
    messages: (session?.messages ?? []).map(serializeMessage),
    messageCount: session?.messageCount ?? 0,
    maxMessages: LIMITS.maxMessagesPerConversation,
  };
}

router.get('/status', async (req, res) => {
  const { available, reason } = await availability();
  res.json({
    available,
    reason,
    message: available ? null : reason === 'budget_exhausted' ? BUDGET_MESSAGE : OFFLINE_MESSAGE,
    limits: {
      maxInputChars: LIMITS.maxInputChars,
      maxMessagesPerConversation: LIMITS.maxMessagesPerConversation,
    },
  });
});

router.get('/session', async (req, res) => {
  res.json(transcript(await currentSession(req.visitorId)));
});

router.post('/session/reset', async (req, res) => {
  const result = resetLimiter.hit(req.ip);
  if (!result.ok) throw rateLimited(res, result, 'Too many fresh starts. Please wait a bit.');
  res.json(transcript(await startOver(sessionKeys(req))));
});

router.post('/messages', async (req, res) => {
  const { available, reason } = await availability();
  if (!available) throw unavailableError(reason);

  const raw = req.body?.message;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw badRequest('Type a message first.', { field: 'message' });
  if (text.length > LIMITS.maxInputChars) {
    throw badRequest(`Messages can be up to ${LIMITS.maxInputChars} characters.`, {
      field: 'message',
    });
  }

  const session = await ensureSession(sessionKeys(req));
  if (session.messageCount >= LIMITS.maxMessagesPerConversation) {
    throw new HttpError(
      429,
      'CONVERSATION_LIMIT',
      'This conversation has reached its limit. Start over to keep chatting.',
    );
  }

  const limit = messageLimiter.hit(req.ip);
  if (!limit.ok) {
    throw rateLimited(
      res,
      limit,
      'You’ve sent a lot of messages. Please wait a bit and try again.',
    );
  }

  if (!claimTurn(req.visitorId)) {
    throw new HttpError(409, 'TURN_IN_PROGRESS', 'Hang on, I’m still answering your last message.');
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const emit = (event, data) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runTurn({
      client: getAssistantClient(),
      session,
      text,
      owner: ownerOf(req),
      user: req.user,
      emit,
      signal: controller.signal,
    });
  } catch (error) {
    // Headers are sent, so the error handler can't answer; report in-stream.
    console.error('[assistant] turn failed:', error.name);
    emit('error', { message: 'Sorry, something went wrong. Please try again.' });
  } finally {
    releaseTurn(req.visitorId);
    res.end();
  }
});

export default router;

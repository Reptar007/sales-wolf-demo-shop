/**
 * Reads the assistant's reply, which streams back as Server-Sent Events on the
 * POST response. EventSource can't POST, so this is fetch + ReadableStream
 * (and CSP connect-src 'self' is satisfied: it's our own /api).
 */

import { ApiError } from '../../lib/api.js';

/** Splits an SSE buffer into complete events; returns [events, leftover]. */
export function parseSseChunk(buffer) {
  const events = [];
  const parts = buffer.split('\n\n');
  const leftover = parts.pop();
  for (const part of parts) {
    let event = 'message';
    const data = [];
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) });
    } catch {
      // Ignore a malformed event rather than dropping the whole reply.
    }
  }
  return [events, leftover];
}

/**
 * Sends a message and calls onEvent({ event, data }) for each streamed event.
 * Throws ApiError when the server refuses before streaming (limits, offline).
 */
export async function sendAssistantMessage(message, { signal, onEvent }) {
  const response = await fetch('/api/assistant/messages', {
    method: 'POST',
    signal,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ message }),
  });

  if (!response.ok || !response.body) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    throw new ApiError(response.status, body);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const [events, leftover] = parseSseChunk(buffer + value);
    buffer = leftover;
    for (const event of events) onEvent(event);
  }
}

/**
 * A fake Anthropic API for assistant tests: the real SDK client and tool
 * runner, with a scripted `fetch` that answers POST /v1/messages with canned
 * Server-Sent Events. Nothing leaves the process.
 *
 * Each script step is a function (requestBody, callIndex) => reply, where reply
 * is { blocks, stopReason, usage, model, hang }. Blocks are
 * { type: 'text', text } or { type: 'tool_use', name, input }. `hang: true`
 * never finishes, until the request is aborted.
 */

import Anthropic from '@anthropic-ai/sdk';

export const text = (value) => ({ type: 'text', text: value });
export const toolUse = (name, input) => ({ type: 'tool_use', name, input });

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function replyEvents(reply, index) {
  const model = reply.model ?? 'claude-opus-5';
  const usage = { input_tokens: 1000, output_tokens: 100, ...reply.usage };
  const events = [
    {
      type: 'message_start',
      message: {
        id: `msg_fake_${index}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { ...usage, output_tokens: 1 },
      },
    },
  ];
  reply.blocks.forEach((block, i) => {
    if (block.type === 'text') {
      events.push({
        type: 'content_block_start',
        index: i,
        content_block: { type: 'text', text: '' },
      });
      // Two deltas, so tests see real streaming.
      const mid = Math.ceil(block.text.length / 2);
      for (const part of [block.text.slice(0, mid), block.text.slice(mid)]) {
        if (part) {
          events.push({
            type: 'content_block_delta',
            index: i,
            delta: { type: 'text_delta', text: part },
          });
        }
      }
    } else {
      events.push({
        type: 'content_block_start',
        index: i,
        content_block: {
          type: 'tool_use',
          id: `toolu_fake_${index}_${i}`,
          name: block.name,
          input: {},
        },
      });
      events.push({
        type: 'content_block_delta',
        index: i,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
      });
    }
    events.push({ type: 'content_block_stop', index: i });
  });
  const hasTool = reply.blocks.some((b) => b.type === 'tool_use');
  events.push({
    type: 'message_delta',
    delta: {
      stop_reason: reply.stopReason ?? (hasTool ? 'tool_use' : 'end_turn'),
      stop_sequence: null,
    },
    usage: { output_tokens: usage.output_tokens },
  });
  events.push({ type: 'message_stop' });
  return events;
}

export function createFakeAnthropic(script) {
  const requests = [];
  const state = { aborted: 0 };

  async function fakeFetch(url, init = {}) {
    const index = requests.length;
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), body, headers: init.headers });
    const step = script[Math.min(index, script.length - 1)];
    const reply = step(body, index);

    if (reply.hang) {
      const stream = new ReadableStream({
        start(controller) {
          const first = sse(replyEvents({ blocks: [] }, index).slice(0, 1));
          controller.enqueue(new TextEncoder().encode(first));
          init.signal?.addEventListener('abort', () => {
            state.aborted += 1;
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    }

    return new Response(sse(replyEvents(reply, index)), {
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'request-id': `req_fake_${index}` },
    });
  }

  return {
    requests,
    state,
    client: () => new Anthropic({ apiKey: 'test-key-not-real', fetch: fakeFetch, maxRetries: 0 }),
  };
}

/** Reads an SSE response body into [{ event, data }]. */
export async function readEvents(response) {
  const raw = await response.text();
  return raw
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}

/** The tool_result blocks the runner sent back on a given request. */
export function toolResults(request) {
  const last = request.body.messages.at(-1);
  return Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result') : [];
}

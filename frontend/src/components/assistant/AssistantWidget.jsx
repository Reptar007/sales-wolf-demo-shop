import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useCart } from '../../context/CartContext.jsx';
import { sendAssistantMessage } from './stream.js';

/**
 * The AI shopping assistant (P4): a floating helper backed by Claude. Its
 * answers vary run to run, which is the point: it shows QA Wolf testing a
 * non-deterministic surface by asserting on what it did (searched, linked a
 * real product, moved the cart count), not on its exact words.
 */

export const STARTER_PROMPTS = [
  'Find a waterproof jacket under $150',
  'What boots do you have in stock?',
  'Add a cast iron skillet to my cart',
  'Where is my last order?',
];

/** Storefront product page. Links come only from tool results, never parsed text. */
export const productPath = (slug) => `/p/${slug}`;

const MAX_INPUT = 500;

function ToolChips({ tools }) {
  if (!tools.length) return null;
  return (
    <ul className="assistant__tools" aria-label="Assistant activity">
      {tools.map((tool) => (
        <li
          key={tool.id ?? tool.name}
          className={`assistant__chip assistant__chip--${tool.status}`}
          data-testid="assistant-tool-chip"
        >
          {tool.status === 'running'
            ? tool.label
            : tool.status === 'error'
              ? `${tool.label.replace(/…$/, '')} didn’t work`
              : tool.label.replace(/…$/, ' ✓')}
        </li>
      ))}
    </ul>
  );
}

function Message({ message }) {
  return (
    <li
      className={`assistant__message assistant__message--${message.role}${message.error ? ' assistant__message--error' : ''}`}
      data-testid={`assistant-message-${message.role}`}
    >
      <span className="visually-hidden">
        {message.role === 'user' ? 'You said:' : 'Assistant said:'}
      </span>
      <p className="assistant__text">{message.text}</p>
      {message.cartAdds?.length > 0 && (
        <ul className="assistant__added">
          {message.cartAdds.map((added, i) => (
            <li key={`${added.slug}-${i}`}>
              Added to cart: {added.quantity} × {added.name}
              {added.option && added.option !== 'Standard' ? ` (${added.option})` : ''}
            </li>
          ))}
        </ul>
      )}
      {message.products?.length > 0 && (
        <ul className="assistant__products" aria-label="Products mentioned">
          {message.products.map((p) => (
            <li key={p.slug}>
              <Link to={productPath(p.slug)} data-testid="assistant-product-link">
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function AssistantWidget() {
  const { refresh: refreshCart } = useCart();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null); // { available, message } once loaded
  const [messages, setMessages] = useState([]);
  const [limitReached, setLimitReached] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [tools, setTools] = useState([]);
  const [error, setError] = useState(null);

  const titleId = useId();
  const inputId = useId();
  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const transcriptRef = useRef(null);
  const abortRef = useRef(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [statusData, session] = await Promise.all([
        api('/assistant/status'),
        api('/assistant/session'),
      ]);
      setStatus(statusData);
      setMessages(session.messages);
      setLimitReached(session.messageCount >= session.maxMessages);
    } catch {
      setStatus({ available: false, message: 'The WolfMart assistant is offline right now.' });
    }
  }, []);

  useEffect(() => {
    if (open && !loadedRef.current) {
      loadedRef.current = true;
      load();
    }
  }, [open, load]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, status]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, tools]);

  // Leaving the page mid-reply stops the model call server-side.
  useEffect(() => () => abortRef.current?.abort(), []);

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  const updateLast = (patch) =>
    setMessages((list) => {
      const next = [...list];
      const last = next.at(-1);
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) };
      return next;
    });

  async function send(text) {
    const message = text.trim();
    if (!message || pending) return;
    setDraft('');
    setError(null);
    setTools([]);
    setPending(true);
    setMessages((list) => [
      ...list,
      { id: `local-user-${Date.now()}`, role: 'user', text: message },
      { id: `local-reply-${Date.now()}`, role: 'assistant', text: '', streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await sendAssistantMessage(message, {
        signal: controller.signal,
        onEvent: ({ event, data }) => {
          if (event === 'text') updateLast((last) => ({ text: last.text + data.delta }));
          else if (event === 'replace') updateLast({ text: data.text });
          else if (event === 'tool') {
            setTools((list) => {
              const existing = list.find((t) => t.id === data.id);
              if (existing) {
                return list.map((t) => (t.id === data.id ? { ...t, status: data.status } : t));
              }
              return [...list, { ...data, label: data.label ?? 'Working…' }];
            });
          } else if (event === 'cart') {
            refreshCart().catch(() => {});
          } else if (event === 'done') {
            updateLast({ ...data, streaming: false });
          } else if (event === 'error') {
            updateLast({ text: data.message, error: true, streaming: false });
          }
        },
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      // Refused before streaming: drop the placeholder reply and say why.
      setMessages((list) => list.slice(0, -1));
      if (err.code === 'CONVERSATION_LIMIT') setLimitReached(true);
      if (err.code === 'ASSISTANT_OFFLINE' || err.code === 'ASSISTANT_BUDGET_EXHAUSTED') {
        setStatus((s) => ({ ...s, available: false, message: err.message }));
      }
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setPending(false);
      setMessages((list) => list.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    }
  }

  async function startOver() {
    abortRef.current?.abort();
    setError(null);
    setTools([]);
    try {
      const session = await api('/assistant/session/reset', { method: 'POST' });
      setMessages(session.messages);
      setLimitReached(false);
    } catch (err) {
      setError(err.message);
    }
    inputRef.current?.focus();
  }

  const offline = status && !status.available;
  const ready = status?.available && !limitReached;

  return (
    <div className="assistant">
      <button
        ref={launcherRef}
        type="button"
        className="assistant__launcher"
        aria-label="Ask the WolfMart assistant"
        aria-expanded={open}
        aria-controls={open ? `${titleId}-panel` : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        data-testid="assistant-launcher"
      >
        <span aria-hidden="true">✦</span>
      </button>

      {open && (
        <section
          id={`${titleId}-panel`}
          className="assistant__panel"
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          data-testid="assistant-panel"
        >
          <header className="assistant__header">
            <h2 id={titleId}>WolfMart assistant</h2>
            <div className="assistant__header-actions">
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={startOver}
                disabled={!status?.available || pending}
              >
                Start over
              </button>
              <button
                type="button"
                className="assistant__close"
                onClick={close}
                aria-label="Close assistant"
              >
                ×
              </button>
            </div>
          </header>

          <div className="assistant__body" ref={transcriptRef}>
            {!status && <p className="muted">Loading…</p>}

            {offline && (
              <div className="assistant__offline" role="status" data-testid="assistant-offline">
                <p>
                  <strong>The assistant is offline.</strong>
                </p>
                <p>{status.message ?? 'Browse or search the store instead.'}</p>
              </div>
            )}

            {status?.available && (
              <>
                <p className="assistant__intro">
                  Hi! I can find products, check stock, add things to your cart, and look up your
                  orders. Answers are AI-generated and may vary.
                </p>
                <ol
                  className="assistant__transcript"
                  aria-live="polite"
                  aria-busy={pending}
                  aria-label="Conversation"
                  data-testid="assistant-transcript"
                >
                  {messages.map((m) => (
                    <Message key={m.id} message={m} />
                  ))}
                </ol>
                <ToolChips tools={tools} />
                {messages.length === 0 && (
                  <div className="assistant__starters">
                    <p className="muted">Try asking:</p>
                    {STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="assistant__starter"
                        onClick={() => send(prompt)}
                        disabled={pending}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                {limitReached && (
                  <p className="alert alert--info" role="status">
                    This conversation has reached its limit. Start over to keep chatting.
                  </p>
                )}
              </>
            )}
            {error && (
              <p className="alert alert--error" role="alert">
                {error}
              </p>
            )}
          </div>

          {status?.available && (
            <form
              className="assistant__form"
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              <label htmlFor={inputId} className="visually-hidden">
                Message the WolfMart assistant
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                autoComplete="off"
                placeholder={ready ? 'Ask about products, stock, or orders' : 'Start over to chat'}
                maxLength={MAX_INPUT}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!ready}
              />
              <button
                type="submit"
                className="button button--accent button--small"
                disabled={!ready || pending || !draft.trim()}
              >
                Send
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

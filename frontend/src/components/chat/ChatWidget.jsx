import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import ChatMessages from './ChatMessages.jsx';
import { STATUS_LABELS, mergeMessages, useChatSocket, useTypingSignal } from './useChatSocket.js';

const MAX_LENGTH = 1000;
// If the agent's "stopped typing" never arrives (tab closed), don't spin forever.
const TYPING_TIMEOUT_MS = 8000;

/**
 * The shopper's live chat: a launcher fixed bottom-right and a panel above it.
 * The socket only opens once the shopper has a conversation or opens the
 * panel, so browsing visitors don't each hold a connection.
 */
export default function ChatWidget() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [wantSocket, setWantSocket] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [agentTyping, setAgentTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);
  const ids = { panel: useId(), title: useId(), input: useId(), unread: useId() };

  /** Loads the shopper's open conversation. Also issues the visitor cookie. */
  const refresh = useCallback(async () => {
    try {
      const { conversation: current } = await api('/chat/conversation');
      // A chat closed by the agent stays on screen until the shopper starts over.
      setConversation((shown) => current ?? (shown?.status === 'CLOSED' ? shown : null));
      if (current) {
        setMessages((shown) => mergeMessages(shown, current.messages));
        setWantSocket(true);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showAgentTyping = useCallback((typing) => {
    clearTimeout(typingTimer.current);
    setAgentTyping(typing);
    if (typing) typingTimer.current = setTimeout(() => setAgentTyping(false), TYPING_TIMEOUT_MS);
  }, []);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  const { status, emit } = useChatSocket({
    enabled: wantSocket && ready,
    // Signing in or out changes the cookies, so reconnect to be re-identified.
    reconnectKey: user?.id ?? 'guest',
    handlers: {
      onConnect: refresh,
      'chat:message': (message) => {
        setMessages((shown) => mergeMessages(shown, [message]));
        if (message.sender === 'AGENT') showAgentTyping(false);
      },
      'chat:conversation': (next) => {
        setConversation((shown) =>
          !shown || shown.id === next.id || next.status === 'OPEN' ? { ...shown, ...next } : shown,
        );
      },
      'chat:typing': ({ sender, typing }) => {
        if (sender === 'AGENT') showAgentTyping(typing);
      },
    },
  });

  const sendTyping = useCallback((typing) => emit('customer:typing', { typing }), [emit]);
  const typingSignal = useTypingSignal(sendTyping);

  const unread = open ? 0 : (conversation?.customerUnread ?? 0);
  const closed = conversation?.status === 'CLOSED';
  const shown = conversation ? messages.filter((m) => m.conversationId === conversation.id) : [];

  // Reading the panel clears the unread count (here and on the server).
  useEffect(() => {
    if (open && status === 'connected' && conversation?.customerUnread > 0) {
      setConversation((c) => ({ ...c, customerUnread: 0 }));
      emit('customer:read');
    }
  }, [open, status, conversation?.customerUnread, emit]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, closed]);

  function toggle() {
    setOpen((value) => !value);
    setWantSocket(true);
    setError(null);
  }

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  function startOver() {
    setConversation(null);
    setMessages([]);
    setAgentTyping(false);
    setError(null);
  }

  async function send(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > MAX_LENGTH) {
      setError(`Messages can be at most ${MAX_LENGTH} characters.`);
      return;
    }
    setSending(true);
    setError(null);
    typingSignal.stop();
    const result = await emit('customer:message', { body });
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft('');
    setConversation(result.conversation);
    setMessages((existing) => mergeMessages(existing, result.messages));
    inputRef.current?.focus();
  }

  return (
    <div className="chat-widget">
      {open && (
        <section
          id={ids.panel}
          className="chat-panel"
          role="dialog"
          aria-labelledby={ids.title}
          onKeyDown={(event) => event.key === 'Escape' && close()}
        >
          <header className="chat-panel__header">
            <div>
              <h2 id={ids.title} className="chat-panel__title">
                Chat with WolfMart
              </h2>
              <p
                className={`chat-status chat-status--${status}`}
                role="status"
                data-testid="chat-connection"
              >
                {STATUS_LABELS[status]}
              </p>
            </div>
          </header>

          <ChatMessages
            messages={shown}
            viewer="CUSTOMER"
            label="Chat messages"
            empty="Questions about an order or a product? Send a message and an agent will reply right here."
          />

          <p className="chat-typing" aria-live="polite">
            {agentTyping && !closed ? 'Agent is typing…' : ''}
          </p>

          {error && (
            <p className="alert alert--error chat-panel__alert" role="alert">
              {error}
            </p>
          )}

          {closed ? (
            <div className="chat-panel__closed">
              <p className="alert alert--info chat-panel__alert" role="status">
                This chat has been closed.
              </p>
              <button type="button" className="button button--small" onClick={startOver}>
                Start a new chat
              </button>
            </div>
          ) : (
            <form className="chat-compose" onSubmit={send}>
              <label htmlFor={ids.input} className="visually-hidden">
                Message
              </label>
              <textarea
                id={ids.input}
                ref={inputRef}
                rows={2}
                maxLength={MAX_LENGTH}
                placeholder="Type a message…"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (conversation) typingSignal.ping();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) send(event);
                }}
              />
              <button
                type="submit"
                className="button button--accent button--small"
                disabled={sending || !draft.trim() || status !== 'connected'}
              >
                Send
              </button>
            </form>
          )}
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        className="chat-launcher"
        aria-expanded={open}
        aria-controls={open ? ids.panel : undefined}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-describedby={unread ? ids.unread : undefined}
        onClick={toggle}
      >
        <svg className="chat-launcher__icon" viewBox="0 0 24 24" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 5h16v11H9l-5 4V5z" />}
        </svg>
        <span className="chat-launcher__text" aria-hidden="true">
          {open ? 'Close' : 'Chat'}
        </span>
        {unread > 0 && (
          <>
            <span className="chat-launcher__badge" data-testid="chat-unread" aria-hidden="true">
              {unread}
            </span>
            <span id={ids.unread} className="visually-hidden">
              {unread} unread {unread === 1 ? 'message' : 'messages'}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

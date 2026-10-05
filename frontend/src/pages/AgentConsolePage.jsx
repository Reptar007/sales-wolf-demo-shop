import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import StaffGate from '../components/StaffGate.jsx';
import ChatMessages from '../components/chat/ChatMessages.jsx';
import {
  STATUS_LABELS,
  mergeMessages,
  timeLabel,
  useChatSocket,
  useTypingSignal,
} from '../components/chat/useChatSocket.js';
import { api } from '../lib/api.js';

const MAX_LENGTH = 1000;
const TYPING_TIMEOUT_MS = 8000;

/** Open chats first, then most recent activity. */
function sortConversations(list) {
  return [...list].sort(
    (a, b) =>
      (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) ||
      new Date(b.lastMessageAt) - new Date(a.lastMessageAt),
  );
}

function upsert(list, conversation) {
  const index = list.findIndex((c) => c.id === conversation.id);
  if (index === -1) return sortConversations([conversation, ...list]);
  const next = [...list];
  next[index] = { ...next[index], ...conversation };
  return sortConversations(next);
}

const preview = (c) =>
  c.lastMessage ? `${c.lastMessage.sender === 'AGENT' ? 'You: ' : ''}${c.lastMessage.body}` : '';

/**
 * The SE's side of live chat: every conversation, one thread at a time.
 * Built so one person can run it in a second window while playing the shopper.
 */
function AgentConsole() {
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [customerTyping, setCustomerTyping] = useState({});
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Socket handlers outlive renders, so they read the selection from a ref.
  const selectedRef = useRef(null);
  const typingTimers = useRef({});
  const replyId = useId();
  const replyRef = useRef(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadList = useCallback(async () => {
    try {
      const { conversations: list } = await api('/chat/agent/conversations');
      setConversations(sortConversations(list));
      setLoaded(true);
    } catch (cause) {
      setError(cause.message);
    }
  }, []);

  const loadThread = useCallback(async (id) => {
    if (!id) return;
    try {
      const { conversation } = await api(`/chat/agent/conversations/${encodeURIComponent(id)}`);
      if (selectedRef.current !== id) return;
      setMessages(conversation.messages);
      const summary = { ...conversation };
      delete summary.messages;
      setConversations((list) => upsert(list, summary));
    } catch (cause) {
      setError(cause.message);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const showTyping = useCallback((conversationId, typing) => {
    clearTimeout(typingTimers.current[conversationId]);
    setCustomerTyping((map) => ({ ...map, [conversationId]: typing }));
    if (typing) {
      typingTimers.current[conversationId] = setTimeout(
        () => setCustomerTyping((map) => ({ ...map, [conversationId]: false })),
        TYPING_TIMEOUT_MS,
      );
    }
  }, []);

  useEffect(() => {
    const timers = typingTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const { status, emit } = useChatSocket({
    enabled: true,
    role: 'agent',
    handlers: {
      // On every (re)connect, resync: anything missed while offline shows up.
      onConnect: () => {
        loadList();
        loadThread(selectedRef.current);
      },
      onConnectError: (cause) => {
        if (cause?.message === 'STAFF_ONLY')
          setError('Your agent session expired. Reload to unlock.');
      },
      'chat:message': (message) => {
        if (message.sender === 'CUSTOMER') showTyping(message.conversationId, false);
        if (message.conversationId !== selectedRef.current) return;
        setMessages((shown) => mergeMessages(shown, [message]));
        if (message.sender === 'CUSTOMER' && document.visibilityState === 'visible') {
          emit('agent:read', { conversationId: message.conversationId });
        }
      },
      'chat:conversation': (conversation) => setConversations((list) => upsert(list, conversation)),
      'chat:typing': ({ conversationId, sender, typing }) => {
        if (sender === 'CUSTOMER') showTyping(conversationId, typing);
      },
    },
  });

  const sendTyping = useCallback(
    (typing) => {
      if (selectedRef.current)
        emit('agent:typing', { conversationId: selectedRef.current, typing });
    },
    [emit],
  );
  const typingSignal = useTypingSignal(sendTyping);

  // Catching up on a thread when the tab comes back into view clears its unread.
  useEffect(() => {
    function onVisible() {
      const current = selectedRef.current;
      if (document.visibilityState === 'visible' && current) {
        emit('agent:read', { conversationId: current });
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [emit]);

  function select(id) {
    typingSignal.stop();
    setSelectedId(id);
    selectedRef.current = id;
    setMessages([]);
    setDraft('');
    setError(null);
    loadThread(id);
    emit('agent:read', { conversationId: id });
  }

  async function reply(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy || !selected) return;
    setBusy(true);
    setError(null);
    typingSignal.stop();
    const result = await emit('agent:message', { conversationId: selected.id, body });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDraft('');
    setMessages((shown) => mergeMessages(shown, [result.message]));
    setConversations((list) => upsert(list, result.conversation));
    replyRef.current?.focus();
  }

  async function closeConversation() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    typingSignal.stop();
    const result = await emit('agent:close', { conversationId: selected.id });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConversations((list) => upsert(list, result.conversation));
    loadThread(selected.id);
  }

  const openCount = conversations.filter((c) => c.status === 'OPEN').length;

  return (
    <div className={`agent-console${selected ? ' agent-console--thread' : ''}`}>
      <header className="agent-console__bar">
        <div>
          <h1 className="agent-console__title">Agent console</h1>
          <p className="muted agent-console__sub">
            {openCount} open {openCount === 1 ? 'conversation' : 'conversations'}
          </p>
        </div>
        <p
          className={`chat-status chat-status--${status}`}
          role="status"
          data-testid="agent-connection"
        >
          {STATUS_LABELS[status]}
        </p>
        <Link to="/" className="button button--ghost button--small">
          Back to store
        </Link>
      </header>

      <div className="agent-console__body">
        <nav className="agent-list" aria-label="Conversations">
          {!loaded && <p className="muted agent-list__empty">Loading…</p>}
          {loaded && conversations.length === 0 && (
            <p className="muted agent-list__empty">
              No conversations yet. Open the store in another window and start a chat.
            </p>
          )}
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="agent-list__item"
                  aria-current={c.id === selectedId ? 'true' : undefined}
                  onClick={() => select(c.id)}
                  data-testid="agent-conversation"
                >
                  <span className="agent-list__row">
                    <span className="agent-list__name">{c.customerName}</span>
                    <time className="agent-list__time muted" dateTime={c.lastMessageAt}>
                      {timeLabel(c.lastMessageAt)}
                    </time>
                  </span>
                  <span className="agent-list__row">
                    <span className="agent-list__preview muted">
                      {customerTyping[c.id] && c.status === 'OPEN' ? 'Typing…' : preview(c)}
                    </span>
                    {c.agentUnread > 0 && (
                      <span
                        className="badge badge--accent"
                        aria-label={`${c.agentUnread} unread`}
                        data-testid="agent-unread"
                      >
                        {c.agentUnread}
                      </span>
                    )}
                    <span className={`badge ${c.status === 'OPEN' ? 'badge--ok' : ''}`}>
                      {c.status === 'OPEN' ? 'Open' : 'Closed'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="agent-thread" aria-label="Conversation">
          {!selected ? (
            <p className="muted agent-thread__placeholder">Pick a conversation to reply.</p>
          ) : (
            <>
              <header className="agent-thread__header">
                <button
                  type="button"
                  className="button button--ghost button--small agent-thread__back"
                  onClick={() => {
                    selectedRef.current = null;
                    setSelectedId(null);
                  }}
                >
                  All conversations
                </button>
                <h2 className="agent-thread__title">{selected.customerName}</h2>
                <span className={`badge ${selected.status === 'OPEN' ? 'badge--ok' : ''}`}>
                  {selected.status === 'OPEN' ? 'Open' : 'Closed'}
                </span>
                {selected.status === 'OPEN' && (
                  <button
                    type="button"
                    className="button button--danger button--small"
                    onClick={closeConversation}
                    disabled={busy || status !== 'connected'}
                  >
                    Close conversation
                  </button>
                )}
              </header>

              <ChatMessages
                messages={messages}
                viewer="AGENT"
                customerName={selected.customerName}
                label={`Messages with ${selected.customerName}`}
              />

              <p className="chat-typing" aria-live="polite">
                {customerTyping[selected.id] && selected.status === 'OPEN'
                  ? 'Customer is typing…'
                  : ''}
              </p>

              {error && (
                <p className="alert alert--error" role="alert">
                  {error}
                </p>
              )}

              {selected.status === 'OPEN' ? (
                <form className="chat-compose" onSubmit={reply}>
                  <label htmlFor={replyId} className="visually-hidden">
                    Reply
                  </label>
                  <textarea
                    id={replyId}
                    ref={replyRef}
                    rows={2}
                    maxLength={MAX_LENGTH}
                    placeholder="Write a reply…"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      typingSignal.ping();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) reply(event);
                    }}
                  />
                  <button
                    type="submit"
                    className="button button--accent button--small"
                    disabled={busy || !draft.trim() || status !== 'connected'}
                  >
                    Send
                  </button>
                </form>
              ) : (
                <p className="alert alert--info">
                  This conversation is closed. The customer can start a new one from the store.
                </p>
              )}
            </>
          )}
          {!selected && error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AgentConsolePage() {
  return (
    <StaffGate title="Agent console">
      <AgentConsole />
    </StaffGate>
  );
}

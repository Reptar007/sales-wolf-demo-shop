import { useEffect, useRef } from 'react';
import { timeLabel } from './useChatSocket.js';

/**
 * The message log for either side of a chat. `viewer` is who is reading
 * ('CUSTOMER' or 'AGENT'), which decides whose bubbles say "You".
 */
export default function ChatMessages({ messages, viewer, customerName, label, empty }) {
  const listRef = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  const who = (sender) => {
    if (sender === 'SYSTEM') return 'WolfMart';
    if (sender === viewer) return 'You';
    return sender === 'AGENT' ? 'Agent' : customerName || 'Customer';
  };

  return (
    <ol className="chat-log" ref={listRef} aria-live="polite" aria-label={label} tabIndex={0}>
      {messages.length === 0 && empty && <li className="chat-log__empty muted">{empty}</li>}
      {messages.map((m) => (
        <li
          key={m.id}
          className={`chat-msg chat-msg--${m.sender === 'SYSTEM' ? 'system' : m.sender === viewer ? 'mine' : 'theirs'}`}
          data-sender={m.sender.toLowerCase()}
        >
          <span className="chat-msg__meta">
            <span className="chat-msg__who">{who(m.sender)}</span>{' '}
            <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
          </span>
          <span className="chat-msg__body">{m.body}</span>
        </li>
      ))}
    </ol>
  );
}

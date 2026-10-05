import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/**
 * One live-chat socket, shared shape for the shopper widget and the agent
 * console. Same origin only (CSP connect-src 'self'); identity rides on the
 * cookies the browser already has.
 *
 * status: idle | connecting | connected | reconnecting | offline
 *
 * `handlers.onConnect` fires on the first connect AND every reconnect: that is
 * where callers refetch, so anything sent while the socket was down is shown.
 */
export function useChatSocket({ enabled, role, reconnectKey, handlers }) {
  const [status, setStatus] = useState('idle');
  const socketRef = useRef(null);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = io({
      // WebSocket only: its handshake always carries Origin, which the server checks.
      transports: ['websocket'],
      auth: role ? { role } : {},
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;
    setStatus('connecting');

    const call = (name, payload) => handlersRef.current?.[name]?.(payload);

    socket.on('connect', () => {
      setStatus('connected');
      call('onConnect');
    });
    socket.on('disconnect', (reason) => {
      setStatus('reconnecting');
      // A server-side kick is the one case socket.io won't retry on its own.
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.on('connect_error', (error) => {
      // socket.active is false when the server refused us outright (no retry).
      setStatus(socket.active ? 'reconnecting' : 'offline');
      call('onConnectError', error);
    });
    for (const event of ['chat:message', 'chat:conversation', 'chat:typing']) {
      socket.on(event, (payload) => call(event, payload));
    }

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStatus('idle');
    };
  }, [enabled, role, reconnectKey]);

  /** Emits with an ack; always resolves to { ok, error?, ... }. */
  const emit = useCallback((event, payload = {}) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return Promise.resolve({ ok: false, error: 'Not connected yet. Reconnecting…' });
    }
    return socket
      .timeout(8000)
      .emitWithAck(event, payload)
      .catch(() => ({ ok: false, error: 'The server didn’t answer. Try again.' }));
  }, []);

  return { status, emit };
}

export const STATUS_LABELS = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

/** Adds messages not already present (by id), keeping time order. */
export function mergeMessages(existing, incoming) {
  const seen = new Set(existing.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (!added.length) return existing;
  return [...existing, ...added].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt) || (a.id < b.id ? -1 : 1),
  );
}

/**
 * Sends typing=true once per burst and typing=false after a pause, instead of
 * one event per keystroke.
 */
export function useTypingSignal(send, idleMs = 2000) {
  const state = useRef({ typing: false, timer: null });

  const stop = useCallback(() => {
    clearTimeout(state.current.timer);
    if (state.current.typing) {
      state.current.typing = false;
      send(false);
    }
  }, [send]);

  const ping = useCallback(() => {
    if (!state.current.typing) {
      state.current.typing = true;
      send(true);
    }
    clearTimeout(state.current.timer);
    state.current.timer = setTimeout(stop, idleMs);
  }, [send, stop, idleMs]);

  useEffect(() => {
    const current = state.current;
    return () => clearTimeout(current.timer);
  }, []);

  return { ping, stop };
}

export const timeLabel = (value) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

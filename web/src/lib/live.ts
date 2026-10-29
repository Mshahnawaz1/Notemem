import { useEffect, useRef, useState } from 'preact/hooks';
import { eventsUrl } from './api';
import type { PadEvent } from './api';

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
// The room answers "ping" without waking up; this keeps proxies from dropping an idle socket.
const PING_MS = 30000;

export type LiveStatus = 'connecting' | 'open' | 'closed';

interface Handlers {
  onEvent: (event: PadEvent) => void;
  /** Called each time the socket opens: events sent before that, or while it was down, are lost, so refetch. */
  onOpen: () => void;
}

/** One WebSocket per room, reconnecting with exponential backoff. */
export function useRoomEvents(roomId: string | undefined, secret: string | undefined, handlers: Handlers): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Kept in a ref so new handler closures don't reopen the socket.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!roomId || !secret) return;
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let delay = MIN_DELAY_MS;
    let stopped = false;

    const connect = () => {
      setStatus('connecting');
      socket = new WebSocket(eventsUrl(roomId, secret));
      socket.onopen = () => {
        delay = MIN_DELAY_MS;
        setStatus('open');
        handlersRef.current.onOpen();
        pingTimer = window.setInterval(() => socket?.send('ping'), PING_MS);
      };
      socket.onmessage = (message) => {
        if (message.data === 'pong') return;
        try {
          handlersRef.current.onEvent(JSON.parse(message.data as string) as PadEvent);
        } catch {
          // Ignore anything that isn't an event.
        }
      };
      socket.onclose = () => {
        window.clearInterval(pingTimer);
        if (stopped) return;
        setStatus('closed');
        retryTimer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket?.close();
    };
  }, [roomId, secret]);

  return status;
}

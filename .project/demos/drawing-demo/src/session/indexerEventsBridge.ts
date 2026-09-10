/**
 * Indexer WebSocket fan-out for Document sync events.
 */

import type { DocumentSyncController, DocumentSyncEvent } from './documentSync';

export type IndexerEventsHandle = {
  dispose: () => void;
};

export function connectIndexerDocumentEvents(
  getIndexerUrl: () => string | null,
  sync: DocumentSyncController,
): IndexerEventsHandle {
  let socket: WebSocket | null = null;
  let disposed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function wsUrl(httpBase: string): string {
    const url = new URL(httpBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  function connect(): void {
    if (disposed) return;
    const base = getIndexerUrl()?.trim();
    if (!base) return;

    try {
      socket = new WebSocket(wsUrl(base));
    } catch (err) {
      console.error('[indexerEvents] connect failed', err);
      scheduleReconnect();
      return;
    }

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as DocumentSyncEvent;
        if (
          event.type === 'document.patched' ||
          event.type === 'document.replaced' ||
          event.type === 'document.settings.patched' ||
          event.type === 'document.history.replaced'
        ) {
          sync.applyRemoteEvent(event);
        }
      } catch (err) {
        console.error('[indexerEvents] bad message', err);
      }
    };

    socket.onclose = () => {
      socket = null;
      scheduleReconnect();
    };

    socket.onerror = () => {
      socket?.close();
    };
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1500);
  }

  connect();

  return {
    dispose: () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socket = null;
    },
  };
}

import { ref, inject, type InjectionKey, type Ref } from 'vue';
import { useStream } from './useStream';
import { useChat, handleUserUpdate, handleChatEdit, handleChatDelete } from './useChat';
import type { WsMessage } from '@manlycam/types';

export interface WsInterface {
  connect: () => void;
  disconnect: () => void;
  isConnected: Readonly<Ref<boolean>>;
}

export const WS_INJECTION_KEY: InjectionKey<WsInterface> = Symbol('useWebSocket');

export function useWebSocket(): WsInterface {
  // If injected (child component), return the provided instance
  const injected = inject(WS_INJECTION_KEY, null);
  if (injected) return injected;

  // App-root call: create singleton
  const isConnected = ref(false);
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 30_000;

  function handleMessage(event: MessageEvent<string>) {
    try {
      const msg = JSON.parse(event.data) as WsMessage;
      if (msg.type === 'stream:state') {
        useStream().setStateFromWs(msg.payload);
      }
      if (msg.type === 'chat:message') {
        useChat().handleChatMessage(msg.payload);
      }
      if (msg.type === 'chat:edit') {
        handleChatEdit(msg.payload);
      }
      if (msg.type === 'chat:delete') {
        handleChatDelete(msg.payload.messageId);
      }
      if (msg.type === 'user:update') {
        handleUserUpdate(msg.payload);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  function connect() {
    if (socket && socket.readyState < WebSocket.CLOSING) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${proto}//${window.location.host}/ws`);

    socket.onopen = () => {
      isConnected.value = true;
      reconnectDelay = 1000;
    };
    socket.onmessage = handleMessage;
    socket.onclose = () => {
      isConnected.value = false;
      socket = null;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
        connect();
      }, reconnectDelay);
    };
    socket.onerror = () => {
      socket?.close(); // triggers onclose → backoff reconnect
    };
  }

  function disconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close();
    socket = null;
    isConnected.value = false;
  }

  return { connect, disconnect, isConnected };
}

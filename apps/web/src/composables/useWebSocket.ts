import { ref, inject, type InjectionKey, type Ref } from 'vue';
import { router } from '@/router';
import { useStream } from './useStream';
import {
  useChat,
  handleUserUpdate,
  handleChatEdit,
  handleChatDelete,
  handleEphemeral,
  handleClipTombstoneRestore,
} from './useChat';
import { handleAdminUserUpdate } from './useAdminUsers';
import {
  handlePresenceSeed,
  handlePresenceJoin,
  handlePresenceLeave,
  handleTypingStart,
  handleTypingStop,
  handlePresenceUserUpdate,
  handleModerationMuted,
  handleModerationUnmuted,
} from './usePresence';
import { cacheUsers, lookupUser } from './useUserCache';
import { setStateFromWs as setPiSugarStateFromWs } from './usePiSugar';
import { handleReactionAdd, handleReactionRemove } from './useReactions';
import { refreshCommands } from './useCommands';
import { useAuth } from './useAuth';
import { useBrowserNotifications } from './useBrowserNotifications';
import { useNotificationPreferences } from './useNotificationPreferences';
import { handleClipStatusChanged } from './useClipCreate';
import { handleClipStatusUpdate, handleClipVisibilityChanged } from './useClips';
import type { UserPresence, WsMessage } from '@manlycam/types';

export interface WsInterface {
  connect: () => void;
  disconnect: () => void;
  isConnected: Readonly<Ref<boolean>>;
  sendTypingStart: () => void;
  sendTypingStop: () => void;
}

export const WS_INJECTION_KEY: InjectionKey<WsInterface> = Symbol('useWebSocket');

export function useWebSocket(): WsInterface {
  // If injected (child component), return the provided instance
  /* c8 ignore next 2 */
  const injected = inject(WS_INJECTION_KEY, null);
  if (injected) return injected;

  // App-root call: create singleton
  const isConnected = ref(false);
  let socket: WebSocket | null = null;
  const { user } = useAuth();
  const { showNotification } = useBrowserNotifications();
  const { preferences } = useNotificationPreferences();
  let prevStreamState: string | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 30_000;
  let hasConnectedBefore = false;

  function handleMessage(event: MessageEvent<string>) {
    try {
      const msg = JSON.parse(event.data) as WsMessage;
      if (msg.type === 'stream:state') {
        const before = prevStreamState;
        useStream().setStateFromWs(msg.payload);
        const after = msg.payload.state;
        prevStreamState = after;
        if (before !== null && before !== after && preferences.value.streamState) {
          const body = after === 'live' ? 'Stream is now live!' : 'Stream has gone offline.';
          showNotification('Stream Update', { body });
        }
      }
      if (msg.type === 'chat:message') {
        useChat().handleChatMessage(msg.payload);
        // Cache the message sender so their name resolves even when offline
        const p = msg.payload;
        cacheUsers([
          {
            id: p.userId,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            role: p.authorRole,
            isMuted: false,
            userTag: p.userTag,
          } satisfies UserPresence,
        ]);
        // Mention/chat notifications — skip own messages (server echoes back to sender)
        const currentUserId = user.value?.id;
        if (currentUserId && p.userId !== currentUserId) {
          /* c8 ignore next 3 */
          const resolvedBody = p.content
            .replace(/<@([^>]+)>/g, (_, id: string) => `@${lookupUser(id)?.displayName ?? id}`)
            .trim();
          if (p.content.includes(`<@${currentUserId}>`)) {
            if (preferences.value.mentions) {
              showNotification('You were mentioned', {
                body: `${p.displayName}: ${resolvedBody}`,
              });
            }
          } else if (preferences.value.chatMessages) {
            showNotification(p.displayName, { body: resolvedBody });
          }
        }
      }
      if (msg.type === 'chat:edit') {
        handleChatEdit(msg.payload);
      }
      if (msg.type === 'chat:delete') {
        handleChatDelete(msg.payload.messageId);
      }
      if (msg.type === 'user:update') {
        handleUserUpdate(msg.payload);
        handlePresenceUserUpdate(msg.payload);
        handleAdminUserUpdate(msg.payload);
        cacheUsers([msg.payload]);
      }
      if (msg.type === 'presence:seed') {
        handlePresenceSeed(msg.payload);
        cacheUsers(msg.payload);
      }
      if (msg.type === 'presence:join') {
        handlePresenceJoin(msg.payload);
        cacheUsers([msg.payload]);
      }
      if (msg.type === 'users:info') {
        cacheUsers(msg.payload);
      }
      if (msg.type === 'presence:leave') {
        handlePresenceLeave(msg.payload);
      }
      if (msg.type === 'typing:start') {
        handleTypingStart(msg.payload);
      }
      if (msg.type === 'typing:stop') {
        handleTypingStop(msg.payload);
      }
      if (msg.type === 'moderation:muted') {
        handleModerationMuted(msg.payload);
      }
      if (msg.type === 'moderation:unmuted') {
        handleModerationUnmuted(msg.payload);
      }
      if (msg.type === 'session:revoked') {
        router.push('/banned');
      }
      if (msg.type === 'pisugar:status') {
        setPiSugarStateFromWs(msg.payload);
      }
      if (msg.type === 'chat:ephemeral') {
        handleEphemeral(msg.payload);
      }
      if (msg.type === 'reaction:add') {
        handleReactionAdd(msg.payload, user.value?.id);
      }
      if (msg.type === 'reaction:remove') {
        handleReactionRemove(msg.payload, user.value?.id);
      }
      if (msg.type === 'clip:status-changed') {
        handleClipStatusChanged(msg.payload);
        handleClipStatusUpdate(msg.payload);
      }
      if (msg.type === 'clip:visibility-changed') {
        handleClipVisibilityChanged(msg.payload);
        handleClipTombstoneRestore(msg.payload);
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
      // Request all known users so the cache is fully populated for autocomplete + mention rendering
      socket!.send(JSON.stringify({ type: 'users:directory' }));
      // On reconnect (not initial connect), refresh commands — a server restart
      // may have added new slash commands and also triggered the reconnect.
      if (hasConnectedBefore) {
        void refreshCommands();
      }
      hasConnectedBefore = true;
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
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
      socket = null;
    }
    isConnected.value = false;
  }

  function sendTypingStart() {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'typing:start' }));
    }
  }

  function sendTypingStop() {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'typing:stop' }));
    }
  }

  return { connect, disconnect, isConnected, sendTypingStart, sendTypingStop };
}

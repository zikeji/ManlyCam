import { ref, computed } from 'vue';
import { apiFetch } from '@/lib/api';
import type {
  ChatMessage,
  ChatEdit,
  ClipChatMessage,
  ClipVisibilityChangedPayload,
  UserProfile,
} from '@manlycam/types';

// Module-level singletons — all callers share the same refs (same pattern as useStream)
// Exported directly for test reset (do not access via useChat factory in tests)
export const messages = ref<ChatMessage[]>([]);
export const ephemeralMessages = ref<ChatMessage[]>([]);
export const hasMore = ref(true);
export const isLoadingHistory = ref(false);

export const unreadCount = ref(0);
export const resetUnread = (): void => {
  unreadCount.value = 0;
};
export const incrementUnread = (): void => {
  unreadCount.value++;
};

export const oldestMessageId = computed(() => messages.value[0]?.id);

export const handleUserUpdate = (profile: UserProfile): void => {
  messages.value = messages.value.map((msg) =>
    msg.userId === profile.id
      ? {
          ...msg,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          userTag: profile.userTag,
        }
      : msg,
  );
};

export const handleChatEdit = (edit: ChatEdit): void => {
  messages.value = messages.value.map((msg) =>
    msg.id === edit.messageId
      ? { ...msg, content: edit.content, editHistory: edit.editHistory, updatedAt: edit.updatedAt }
      : msg,
  );
};

export const handleChatDelete = (messageId: string): void => {
  messages.value = messages.value.filter((msg) => msg.id !== messageId);
};

export const handleEphemeral = (payload: ChatMessage): void => {
  ephemeralMessages.value.push(payload);
};

export const dismissEphemeral = (id: string): void => {
  ephemeralMessages.value = ephemeralMessages.value.filter((m) => m.id !== id);
};

// Updates chat clip cards when a clip:visibility-changed WS message arrives.
// - private/deleted: tombstones matching cards immediately in active sessions
// - shared/public: restores tombstones to live cards AND updates live cards with latest clip data
export const handleClipTombstoneRestore = (payload: ClipVisibilityChangedPayload): void => {
  if (!payload.chatClipIds?.length) return;

  const ids = new Set(payload.chatClipIds);
  const isVisible = payload.visibility === 'shared' || payload.visibility === 'public';

  messages.value = messages.value.map((msg) => {
    if (msg.messageType !== 'clip' || !ids.has(msg.id)) return msg;

    if (!isVisible) {
      return { ...msg, tombstone: true } as ClipChatMessage;
    }

    if (!payload.clip) return msg;

    const clipData = payload.clip;
    const updated: ClipChatMessage = {
      ...(msg as ClipChatMessage),
      clipId: clipData.clipId,
      clipName: clipData.clipName,
      clipDurationSeconds: clipData.clipDurationSeconds,
      clipThumbnailUrl: clipData.clipThumbnailUrl,
      clipperName: clipData.clipperName,
      clipperAvatarUrl: clipData.clipperAvatarUrl,
      tombstone: undefined,
    };
    return updated;
  });
};

// Merges incoming messages into the existing list:
// - Prepends messages with new IDs
// - Updates existing messages if the incoming version has tombstone: true
function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const incomingMap = new Map(incoming.map((m) => [m.id, m]));
  const existingIds = new Set(existing.map((m) => m.id));

  // Apply tombstone updates to existing messages
  const existingUpdated = existing.map((msg) => {
    const incomingVersion = incomingMap.get(msg.id);
    if (incomingVersion?.messageType === 'clip' && incomingVersion.tombstone) {
      return { ...msg, tombstone: true } as ClipChatMessage;
    }
    return msg;
  });

  // Prepend only messages that are not already in the existing list
  const newMessages = incoming.filter((m) => !existingIds.has(m.id));
  return [...newMessages, ...existingUpdated];
}

export const useChat = () => {
  const sendChatMessage = async (content: string): Promise<void> => {
    await apiFetch<{ message: ChatMessage }>('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  };

  const handleChatMessage = (msg: ChatMessage): void => {
    messages.value.push(msg);
  };

  const initHistory = async (): Promise<void> => {
    if (isLoadingHistory.value) return;
    isLoadingHistory.value = true;
    const data = await apiFetch<{ messages: ChatMessage[]; hasMore: boolean }>(
      '/api/chat/history?limit=50',
    );
    messages.value = mergeMessages(messages.value, data.messages);
    hasMore.value = data.hasMore;
    isLoadingHistory.value = false;
  };

  const loadMoreHistory = async (): Promise<void> => {
    if (isLoadingHistory.value || !hasMore.value) return;
    isLoadingHistory.value = true;
    const before = oldestMessageId.value;
    const url = before
      ? `/api/chat/history?limit=50&before=${before}`
      : '/api/chat/history?limit=50';
    const data = await apiFetch<{ messages: ChatMessage[]; hasMore: boolean }>(url);
    messages.value = mergeMessages(messages.value, data.messages);
    hasMore.value = data.hasMore;
    isLoadingHistory.value = false;
  };

  const editMessage = async (messageId: string, content: string): Promise<void> => {
    await apiFetch<{ edit: ChatEdit }>(`/api/chat/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    // WS broadcast from server drives local state update via handleChatEdit
  };

  const deleteMessage = async (messageId: string): Promise<void> => {
    await apiFetch<void>(`/api/chat/messages/${messageId}`, { method: 'DELETE' });
    // WS broadcast from server drives local state update via handleChatDelete
  };

  return {
    messages,
    ephemeralMessages,
    sendChatMessage,
    handleChatMessage,
    initHistory,
    loadMoreHistory,
    hasMore,
    isLoadingHistory,
    handleUserUpdate,
    editMessage,
    deleteMessage,
  };
};

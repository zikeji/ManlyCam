import { ref, computed } from 'vue';
import { apiFetch } from '@/lib/api';
import type { ChatMessage, ChatEdit, UserProfile } from '@manlycam/types';

// Module-level singletons — all callers share the same refs (same pattern as useStream)
// Exported directly for test reset (do not access via useChat factory in tests)
export const messages = ref<ChatMessage[]>([]);
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
    messages.value = [...data.messages, ...messages.value];
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
    messages.value = [...data.messages, ...messages.value];
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

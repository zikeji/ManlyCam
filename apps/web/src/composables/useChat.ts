import { ref, computed } from 'vue';
import { apiFetch } from '@/lib/api';
import type { ChatMessage } from '@manlycam/types';

// Module-level singletons — all callers share the same refs (same pattern as useStream)
const messages = ref<ChatMessage[]>([]);
const hasMore = ref(true);
const isLoadingHistory = ref(false);

const oldestMessageId = computed(() => messages.value[0]?.id);

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

  return {
    messages,
    sendChatMessage,
    handleChatMessage,
    initHistory,
    loadMoreHistory,
    hasMore,
    isLoadingHistory,
  };
};

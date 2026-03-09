import { ref } from 'vue';
import { apiFetch } from '@/lib/api';
import type { ChatMessage } from '@manlycam/types';

// Module-level singleton — all callers share the same ref (same pattern as useStream)
const messages = ref<ChatMessage[]>([]);

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

  return { messages, sendChatMessage, handleChatMessage };
};

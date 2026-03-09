import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';
import { useChat } from './useChat';
import type { ChatMessage } from '@manlycam/types';

const mockMessage: ChatMessage = {
  id: 'msg-001',
  userId: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  content: 'Hello',
  editHistory: null,
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-03-08T10:00:00.000Z',
  userTag: null,
};

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module-level singleton between tests
    const { messages } = useChat();
    messages.value = [];
  });

  describe('sendChatMessage', () => {
    it('calls apiFetch with POST /api/chat/messages', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ message: mockMessage });

      const { sendChatMessage } = useChat();
      await sendChatMessage('Hello');

      expect(apiFetch).toHaveBeenCalledWith('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello' }),
      });
    });

    it('does not append message to local state (WS echo handles display)', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ message: mockMessage });

      const { sendChatMessage, messages } = useChat();
      await sendChatMessage('Hello');

      expect(messages.value).toHaveLength(0);
    });
  });

  describe('handleChatMessage', () => {
    it('appends incoming WS message to messages array', () => {
      const { handleChatMessage, messages } = useChat();
      handleChatMessage(mockMessage);

      expect(messages.value).toHaveLength(1);
      expect(messages.value[0]).toEqual(mockMessage);
    });

    it('appends multiple messages in order', () => {
      const { handleChatMessage, messages } = useChat();
      const msg2 = { ...mockMessage, id: 'msg-002', content: 'World' };
      handleChatMessage(mockMessage);
      handleChatMessage(msg2);

      expect(messages.value).toHaveLength(2);
      expect(messages.value[1].id).toBe('msg-002');
    });
  });
});

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
    // Reset module-level singletons between tests
    const { messages, hasMore, isLoadingHistory } = useChat();
    messages.value = [];
    hasMore.value = true;
    isLoadingHistory.value = false;
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

  describe('initHistory', () => {
    it('prepends fetched messages to existing messages', async () => {
      const existing = { ...mockMessage, id: 'msg-ws-001' };
      const { messages, initHistory } = useChat();
      messages.value = [existing];

      const historyMsg = { ...mockMessage, id: 'msg-hist-001' };
      vi.mocked(apiFetch).mockResolvedValue({ messages: [historyMsg], hasMore: false });

      await initHistory();

      expect(messages.value[0].id).toBe('msg-hist-001');
      expect(messages.value[1].id).toBe('msg-ws-001');
    });

    it('sets hasMore from response', async () => {
      const { hasMore, initHistory } = useChat();
      vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: true });

      await initHistory();

      expect(hasMore.value).toBe(true);
    });

    it('sets isLoadingHistory false after completion', async () => {
      const { isLoadingHistory, initHistory } = useChat();
      vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: false });

      await initHistory();

      expect(isLoadingHistory.value).toBe(false);
    });

    it('calls GET /api/chat/history?limit=50', async () => {
      const { initHistory } = useChat();
      vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: false });

      await initHistory();

      expect(apiFetch).toHaveBeenCalledWith('/api/chat/history?limit=50');
    });

    it('returns early without fetching when already loading', async () => {
      const { isLoadingHistory, initHistory } = useChat();
      isLoadingHistory.value = true;

      await initHistory();

      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('loadMoreHistory', () => {
    it('prepends older messages before existing messages', async () => {
      const newerMsg = { ...mockMessage, id: 'MSG002', createdAt: '2026-03-08T11:00:00.000Z' };
      const olderMsg = { ...mockMessage, id: 'MSG001', createdAt: '2026-03-08T10:00:00.000Z' };
      const { messages, loadMoreHistory } = useChat();
      messages.value = [newerMsg];

      vi.mocked(apiFetch).mockResolvedValue({ messages: [olderMsg], hasMore: false });

      await loadMoreHistory();

      expect(messages.value[0].id).toBe('MSG001');
      expect(messages.value[1].id).toBe('MSG002');
    });

    it('calls GET /api/chat/history?limit=50&before={oldestMessageId}', async () => {
      const { messages, loadMoreHistory } = useChat();
      messages.value = [{ ...mockMessage, id: 'MSG010' }];

      vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: false });

      await loadMoreHistory();

      expect(apiFetch).toHaveBeenCalledWith('/api/chat/history?limit=50&before=MSG010');
    });

    it('sets hasMore false when response has no more', async () => {
      const { messages, hasMore, loadMoreHistory } = useChat();
      messages.value = [mockMessage];
      vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: false });

      await loadMoreHistory();

      expect(hasMore.value).toBe(false);
    });

    it('returns early without fetching when already loading', async () => {
      const { isLoadingHistory, loadMoreHistory } = useChat();
      isLoadingHistory.value = true;

      await loadMoreHistory();

      expect(apiFetch).not.toHaveBeenCalled();
    });

    it('returns early without fetching when hasMore is false', async () => {
      const { hasMore, loadMoreHistory } = useChat();
      hasMore.value = false;

      await loadMoreHistory();

      expect(apiFetch).not.toHaveBeenCalled();
    });

    it('sets isLoadingHistory false after completion', async () => {
      const { messages, isLoadingHistory, loadMoreHistory } = useChat();
      messages.value = [mockMessage];
      vi.mocked(apiFetch).mockResolvedValue({ messages: [], hasMore: false });

      await loadMoreHistory();

      expect(isLoadingHistory.value).toBe(false);
    });
  });
});

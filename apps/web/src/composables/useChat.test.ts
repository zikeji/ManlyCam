import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';
import {
  useChat,
  handleUserUpdate,
  handleChatEdit,
  handleChatDelete,
  unreadCount,
  resetUnread,
  incrementUnread,
} from './useChat';
import type { ChatMessage, ChatEdit, UserProfile } from '@manlycam/types';

const mockUserProfile: UserProfile = {
  id: 'user-001',
  displayName: 'Updated Name',
  avatarUrl: 'https://example.com/new-avatar.jpg',
  role: 'ViewerCompany',
  isMuted: false,
  userTag: { text: 'Staff', color: '#00FF00' },
};

const mockMessage: ChatMessage = {
  id: 'msg-001',
  userId: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  authorRole: 'ViewerCompany',
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
    unreadCount.value = 0;
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
    it('fetches latest messages without cursor when messages array is empty', async () => {
      const { messages, loadMoreHistory } = useChat();
      messages.value = []; // Empty state

      vi.mocked(apiFetch).mockResolvedValue({ messages: [mockMessage], hasMore: false });

      await loadMoreHistory();

      expect(apiFetch).toHaveBeenCalledWith('/api/chat/history?limit=50');
    });

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

  describe('handleUserUpdate', () => {
    it('updates displayName, avatarUrl, and userTag on matching messages', () => {
      const { messages } = useChat();
      messages.value = [{ ...mockMessage, userId: 'user-001' }];

      handleUserUpdate(mockUserProfile);

      expect(messages.value[0].displayName).toBe('Updated Name');
      expect(messages.value[0].avatarUrl).toBe('https://example.com/new-avatar.jpg');
      expect(messages.value[0].userTag).toEqual({ text: 'Staff', color: '#00FF00' });
    });

    it('leaves messages from other userIds unchanged', () => {
      const { messages } = useChat();
      const otherMsg = { ...mockMessage, id: 'msg-002', userId: 'user-999', displayName: 'Other' };
      messages.value = [{ ...mockMessage, userId: 'user-001' }, otherMsg];

      handleUserUpdate(mockUserProfile);

      expect(messages.value[1].displayName).toBe('Other');
      expect(messages.value[1].userId).toBe('user-999');
    });

    it('works when messages is empty (no error thrown)', () => {
      const { messages } = useChat();
      messages.value = [];
      expect(() => handleUserUpdate(mockUserProfile)).not.toThrow();
      expect(messages.value).toHaveLength(0);
    });

    it('correctly sets userTag to null when profile has userTag null', () => {
      const { messages } = useChat();
      messages.value = [
        { ...mockMessage, userId: 'user-001', userTag: { text: 'Old', color: '#000' } },
      ];

      handleUserUpdate({ ...mockUserProfile, userTag: null });

      expect(messages.value[0].userTag).toBeNull();
    });
  });

  describe('unreadCount', () => {
    it('unreadCount starts at 0', () => {
      expect(unreadCount.value).toBe(0);
    });

    it('incrementUnread increments by 1', () => {
      incrementUnread();
      expect(unreadCount.value).toBe(1);
    });

    it('incrementUnread called twice results in unreadCount === 2', () => {
      incrementUnread();
      incrementUnread();
      expect(unreadCount.value).toBe(2);
    });

    it('resetUnread sets to 0 after incrementing', () => {
      incrementUnread();
      incrementUnread();
      resetUnread();
      expect(unreadCount.value).toBe(0);
    });
  });

  describe('handleChatEdit', () => {
    const edit: ChatEdit = {
      messageId: 'msg-001',
      content: 'Edited content',
      editHistory: [{ content: 'Hello', editedAt: '2026-03-08T10:00:00.000Z' }],
      updatedAt: '2026-03-08T11:00:00.000Z',
    };

    it('updates matching message content, editHistory, and updatedAt in-place', () => {
      const { messages } = useChat();
      messages.value = [{ ...mockMessage }];

      handleChatEdit(edit);

      expect(messages.value[0].content).toBe('Edited content');
      expect(messages.value[0].editHistory).toEqual(edit.editHistory);
      expect(messages.value[0].updatedAt).toBe('2026-03-08T11:00:00.000Z');
    });

    it('leaves non-matching messages unchanged', () => {
      const { messages } = useChat();
      const otherMsg = { ...mockMessage, id: 'msg-002', content: 'Other' };
      messages.value = [{ ...mockMessage }, otherMsg];

      handleChatEdit(edit);

      expect(messages.value[1].content).toBe('Other');
      expect(messages.value[1].id).toBe('msg-002');
    });

    it('works when editHistory was null before', () => {
      const { messages } = useChat();
      messages.value = [{ ...mockMessage, editHistory: null }];

      handleChatEdit({
        ...edit,
        editHistory: [{ content: 'Hello', editedAt: '2026-03-08T10:00:00.000Z' }],
      });

      expect(messages.value[0].editHistory).toHaveLength(1);
    });
  });

  describe('handleChatDelete', () => {
    it('removes message with matching ID from the list', () => {
      const { messages } = useChat();
      messages.value = [{ ...mockMessage }];

      handleChatDelete('msg-001');

      expect(messages.value).toHaveLength(0);
    });

    it('leaves messages with non-matching IDs in the list', () => {
      const { messages } = useChat();
      const otherMsg = { ...mockMessage, id: 'msg-002' };
      messages.value = [{ ...mockMessage }, otherMsg];

      handleChatDelete('msg-001');

      expect(messages.value).toHaveLength(1);
      expect(messages.value[0].id).toBe('msg-002');
    });

    it('works when messages list is empty (no-op)', () => {
      const { messages } = useChat();
      messages.value = [];

      expect(() => handleChatDelete('msg-001')).not.toThrow();
      expect(messages.value).toHaveLength(0);
    });
  });

  describe('editMessage', () => {
    it('calls apiFetch with PATCH and correct JSON body', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ edit: {} });

      const { editMessage } = useChat();
      await editMessage('msg-001', 'New content');

      expect(apiFetch).toHaveBeenCalledWith('/api/chat/messages/msg-001', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'New content' }),
      });
    });

    it('resolves without error on success', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ edit: {} });

      const { editMessage } = useChat();
      await expect(editMessage('msg-001', 'New content')).resolves.toBeUndefined();
    });
  });

  describe('deleteMessage', () => {
    it('calls apiFetch with DELETE method', async () => {
      vi.mocked(apiFetch).mockResolvedValue(undefined);

      const { deleteMessage } = useChat();
      await deleteMessage('msg-001');

      expect(apiFetch).toHaveBeenCalledWith('/api/chat/messages/msg-001', { method: 'DELETE' });
    });
  });
});

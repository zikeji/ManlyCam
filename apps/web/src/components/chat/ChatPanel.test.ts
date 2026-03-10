import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { ref, defineComponent } from 'vue';
import ChatPanel from './ChatPanel.vue';
import type { ChatMessage } from '@manlycam/types';

const mockMessages = ref<ChatMessage[]>([]);
const mockHasMore = ref(true);
const mockIsLoadingHistory = ref(false);
const mockSendChatMessage = vi.fn();
const mockInitHistory = vi.fn();
const mockLoadMoreHistory = vi.fn();
const mockEditMessage = vi.fn();
const mockDeleteMessage = vi.fn();

vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendChatMessage: mockSendChatMessage,
    handleChatMessage: vi.fn(),
    initHistory: mockInitHistory,
    loadMoreHistory: mockLoadMoreHistory,
    hasMore: mockHasMore,
    isLoadingHistory: mockIsLoadingHistory,
    editMessage: mockEditMessage,
    deleteMessage: mockDeleteMessage,
  }),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: ref({ id: 'user-001', displayName: 'Test User', avatarUrl: null, role: 'ViewerCompany' }),
    logout: vi.fn(),
  })),
}));

vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: ref('live'),
    initStream: vi.fn(),
    setStateFromWs: vi.fn(),
  }),
}));

vi.mock('@/composables/useAdminStream', () => ({
  useAdminStream: () => ({
    startStream: vi.fn(),
    stopStream: vi.fn(),
    isLoading: ref(false),
    error: ref(null),
  }),
}));

const mockSendTypingStart = vi.fn();
const mockSendTypingStop = vi.fn();

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: ref(false),
    sendTypingStart: mockSendTypingStart,
    sendTypingStop: mockSendTypingStop,
  })),
  WS_INJECTION_KEY: Symbol('test'),
}));

const mockViewers = ref([]);
const mockTypingUsers = ref([]);

vi.mock('@/composables/usePresence', () => ({
  usePresence: vi.fn(() => ({
    viewers: mockViewers,
    typingUsers: mockTypingUsers,
  })),
}));

vi.mock('./PresenceList.vue', () => ({
  default: defineComponent({
    props: ['viewers'],
    template: '<div data-testid="presence-list" />',
  }),
}));

vi.mock('./TypingIndicator.vue', () => ({
  default: defineComponent({
    props: ['typingUsers'],
    template: '<div data-testid="typing-indicator" />',
  }),
}));

// Mock IntersectionObserver (not available in jsdom)
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();
vi.stubGlobal(
  'IntersectionObserver',
  vi.fn(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  })),
);

const mockMessage: ChatMessage = {
  id: 'msg-001',
  userId: 'user-001',
  displayName: 'Alice',
  avatarUrl: null,
  authorRole: 'ViewerCompany',
  content: 'Hello!',
  editHistory: null,
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-03-08T10:00:00.000Z',
  userTag: null,
};

describe('ChatPanel.vue', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages.value = [];
    mockHasMore.value = true;
    mockIsLoadingHistory.value = false;
    mockViewers.value = [];
    mockTypingUsers.value = [];
    mockInitHistory.mockResolvedValue(undefined);
    mockLoadMoreHistory.mockResolvedValue(undefined);
    mockEditMessage.mockResolvedValue(undefined);
    mockDeleteMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders Chat and Viewers tabs', () => {
    wrapper = mount(ChatPanel);
    expect(wrapper.text()).toContain('Chat');
    expect(wrapper.text()).toContain('Viewers');
  });

  it('shows empty state when no messages and not loading', async () => {
    mockIsLoadingHistory.value = false;
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Be the first to say something');
  });

  it('renders message list when messages exist', async () => {
    mockMessages.value = [mockMessage];
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Hello!');
    expect(wrapper.text()).toContain('Alice');
  });

  it('renders log region with correct aria attributes', () => {
    wrapper = mount(ChatPanel);
    const log = wrapper.find('[role="log"]');
    expect(log.exists()).toBe(true);
    expect(log.attributes('aria-live')).toBe('polite');
    expect(log.attributes('aria-label')).toBe('Chat messages');
  });

  it('renders ChatInput in desktop slot', () => {
    wrapper = mount(ChatPanel);
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('calls sendChatMessage when ChatInput emits send', async () => {
    mockSendChatMessage.mockResolvedValue(undefined);
    wrapper = mount(ChatPanel);
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Test message');
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: false });
    await flushPromises();

    expect(mockSendChatMessage).toHaveBeenCalledWith('Test message');
  });

  it('renders multiple messages in order', async () => {
    mockMessages.value = [
      mockMessage,
      { ...mockMessage, id: 'msg-002', displayName: 'Bob', content: 'World!' },
    ];
    wrapper = mount(ChatPanel);
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain('Hello!');
    expect(text).toContain('World!');
  });

  it('renders avatar slot for mobile input bar (ProfileAnchor present)', () => {
    wrapper = mount(ChatPanel);
    const mobileBar = wrapper.find('.lg\\:hidden');
    expect(mobileBar.exists()).toBe(true);
  });

  it('calls initHistory on mount', async () => {
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(mockInitHistory).toHaveBeenCalledOnce();
  });

  it('shows loading indicator when isLoadingHistory is true', async () => {
    mockIsLoadingHistory.value = true;
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Loading…');
  });

  it('hides loading indicator when isLoadingHistory is false', async () => {
    mockIsLoadingHistory.value = false;
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(wrapper.text()).not.toContain('Loading…');
  });

  it('renders sentinel div when hasMore is true', async () => {
    mockHasMore.value = true;
    wrapper = mount(ChatPanel);
    await flushPromises();
    const sentinel = wrapper.find('[data-testid="scroll-sentinel"]');
    expect(sentinel.exists()).toBe(true);
  });

  it('does not render sentinel when hasMore is false', async () => {
    mockHasMore.value = false;
    wrapper = mount(ChatPanel);
    await flushPromises();
    const sentinel = wrapper.find('[data-testid="scroll-sentinel"]');
    expect(sentinel.exists()).toBe(false);
  });

  it('sets up IntersectionObserver on mount', async () => {
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(IntersectionObserver).toHaveBeenCalled();
  });

  it('disconnects IntersectionObserver on unmount', async () => {
    wrapper = mount(ChatPanel);
    await flushPromises();
    wrapper.unmount();
    wrapper = null;
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('renders day delineator between messages on different days', async () => {
    mockMessages.value = [
      { ...mockMessage, id: 'msg-001', createdAt: '2026-03-08T10:00:00.000Z' },
      { ...mockMessage, id: 'msg-002', createdAt: '2026-03-09T10:00:00.000Z' },
    ];
    wrapper = mount(ChatPanel);
    await flushPromises();

    // Day separators have role="separator"
    const separators = wrapper.findAll('[role="separator"]');
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });

  it('renders single day delineator for messages on the same day', async () => {
    mockMessages.value = [
      { ...mockMessage, id: 'msg-001', createdAt: new Date(2026, 2, 8, 10, 0).toISOString() },
      {
        ...mockMessage,
        id: 'msg-002',
        content: 'Later',
        createdAt: new Date(2026, 2, 8, 15, 0).toISOString(),
      },
    ];
    wrapper = mount(ChatPanel);
    await flushPromises();

    const separators = wrapper.findAll('[role="separator"]');
    expect(separators).toHaveLength(1);
  });

  it('does not show empty state while loading', async () => {
    mockIsLoadingHistory.value = true;
    mockMessages.value = [];
    wrapper = mount(ChatPanel);
    await flushPromises();
    expect(wrapper.text()).not.toContain('Be the first to say something');
  });

  describe('presence and typing wiring (Story 4.6)', () => {
    it('renders <TypingIndicator> in chat tab with typingUsers from usePresence()', async () => {
      wrapper = mount(ChatPanel);
      await flushPromises();
      const indicator = wrapper.find('[data-testid="typing-indicator"]');
      expect(indicator.exists()).toBe(true);
    });

    it('switches to Viewers tab and renders <PresenceList> with viewers from usePresence()', async () => {
      wrapper = mount(ChatPanel);
      await flushPromises();
      // Emit update:model-value directly on the Tabs component (Reka-UI/jsdom doesn't fire click events reliably)
      const { Tabs } = await import('@/components/ui/tabs');
      const tabsComponent = wrapper.findComponent(Tabs);
      await tabsComponent.vm.$emit('update:modelValue', 'viewers');
      await flushPromises();
      const list = wrapper.find('[data-testid="presence-list"]');
      expect(list.exists()).toBe(true);
    });

    it('typingStart event from desktop ChatInput triggers sendTypingStart', async () => {
      vi.useFakeTimers();
      wrapper = mount(ChatPanel);
      await flushPromises();
      const textarea = wrapper.find('.hidden.lg\\:block textarea');
      await textarea.setValue('h');
      await textarea.trigger('input');
      vi.advanceTimersByTime(400);
      expect(mockSendTypingStart).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('typingStop event from desktop ChatInput triggers sendTypingStop', async () => {
      vi.useFakeTimers();
      wrapper = mount(ChatPanel);
      await flushPromises();
      const textarea = wrapper.find('.hidden.lg\\:block textarea');
      await textarea.setValue('h');
      await textarea.trigger('input');
      vi.advanceTimersByTime(400); // typingStart
      vi.advanceTimersByTime(2000); // typingStop
      expect(mockSendTypingStop).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('message grouping (isContinuation)', () => {
    // Helper: count group-header listitems (those without pl-[52px] = group headers with Avatar)
    // Continuation rows have pl-[52px] in their class; group headers have flex items-start
    function countGroupHeaderListitems(w: VueWrapper): number {
      return w
        .findAll('[role="listitem"]')
        .filter((li) => !li.element.className.includes('pl-[52px]')).length;
    }

    it('second message from same sender within 5 min is a continuation (no Avatar)', async () => {
      mockMessages.value = [
        {
          ...mockMessage,
          id: 'msg-001',
          userId: 'user-001',
          createdAt: '2026-03-09T14:00:00.000Z',
        },
        {
          ...mockMessage,
          id: 'msg-002',
          userId: 'user-001',
          createdAt: '2026-03-09T14:04:00.000Z', // 4 min later — within 5 min window
        },
      ];
      wrapper = mount(ChatPanel);
      await flushPromises();

      // Only first message is a group header; second is a continuation row
      expect(countGroupHeaderListitems(wrapper!)).toBe(1);
    });

    it('second message from same sender more than 5 min later is a new group (Avatar rendered)', async () => {
      mockMessages.value = [
        {
          ...mockMessage,
          id: 'msg-001',
          userId: 'user-001',
          createdAt: '2026-03-09T14:00:00.000Z',
        },
        {
          ...mockMessage,
          id: 'msg-002',
          userId: 'user-001',
          createdAt: '2026-03-09T14:06:00.000Z', // 6 min later — exceeds 5 min window
        },
      ];
      wrapper = mount(ChatPanel);
      await flushPromises();

      // Both messages are group headers
      expect(countGroupHeaderListitems(wrapper!)).toBe(2);
    });

    it('message from different sender is always a new group (Avatar rendered)', async () => {
      mockMessages.value = [
        {
          ...mockMessage,
          id: 'msg-001',
          userId: 'user-001',
          createdAt: '2026-03-09T14:00:00.000Z',
        },
        {
          ...mockMessage,
          id: 'msg-002',
          userId: 'user-002', // different sender
          createdAt: '2026-03-09T14:01:00.000Z', // 1 min later — within window but different user
        },
      ];
      wrapper = mount(ChatPanel);
      await flushPromises();

      // Different sender always starts a new group
      expect(countGroupHeaderListitems(wrapper!)).toBe(2);
    });

    it('day boundary between same-sender messages forces new group (separator + Avatar)', async () => {
      // Use midday UTC times to avoid timezone-edge issues (same pattern as existing passing test)
      mockMessages.value = [
        {
          ...mockMessage,
          id: 'msg-001',
          userId: 'user-001',
          createdAt: '2026-03-08T12:00:00.000Z',
        },
        {
          ...mockMessage,
          id: 'msg-002',
          userId: 'user-001',
          createdAt: '2026-03-09T12:00:00.000Z', // next day — same sender, but day boundary
        },
      ];
      wrapper = mount(ChatPanel);
      await flushPromises();

      // Day separator should exist between the two messages (one per day)
      const separators = wrapper!.findAll('[role="separator"]');
      expect(separators.length).toBeGreaterThanOrEqual(2);

      // Both messages are group headers (day boundary resets group)
      expect(countGroupHeaderListitems(wrapper!)).toBe(2);
    });
  });

  describe('isOwn prop passing and edit/delete event handling', () => {
    const ownMessage: ChatMessage = {
      ...mockMessage,
      id: 'msg-001',
      userId: 'user-001', // matches mocked user.id
    };
    const otherMessage: ChatMessage = {
      ...mockMessage,
      id: 'msg-002',
      userId: 'user-999', // does NOT match mocked user.id
    };

    function mountWithStub() {
      return mount(ChatPanel, {
        global: {
          stubs: {
            ChatMessage: {
              name: 'ChatMessage',
              props: ['message', 'isContinuation', 'isOwn', 'canModerateDelete'],
              emits: ['requestEdit', 'requestDelete'],
              template: `
                <div
                  :data-msg-id="message.id"
                  :data-is-own="String(isOwn)"
                  :data-can-moderate-delete="String(canModerateDelete)"
                  @click.own="$emit('requestEdit', message.id, 'edited')"
                >
                  <button class="trigger-edit" @click="$emit('requestEdit', message.id, 'edited')">edit</button>
                  <button class="trigger-delete" @click="$emit('requestDelete', message.id)">delete</button>
                </div>
              `,
            },
          },
        },
      });
    }

    it('passes isOwn=true when user.id matches message.userId', async () => {
      mockMessages.value = [ownMessage];
      wrapper = mountWithStub();
      await flushPromises();

      const msgEl = wrapper.find('[data-msg-id="msg-001"]');
      expect(msgEl.attributes('data-is-own')).toBe('true');
    });

    it('passes isOwn=false when user.id does not match message.userId', async () => {
      mockMessages.value = [otherMessage];
      wrapper = mountWithStub();
      await flushPromises();

      const msgEl = wrapper.find('[data-msg-id="msg-002"]');
      expect(msgEl.attributes('data-is-own')).toBe('false');
    });

    it('requestEdit event from ChatMessage triggers editMessage with correct args', async () => {
      mockMessages.value = [ownMessage];
      mockEditMessage.mockResolvedValue(undefined);
      wrapper = mountWithStub();
      await flushPromises();

      await wrapper.find('.trigger-edit').trigger('click');
      await flushPromises();

      expect(mockEditMessage).toHaveBeenCalledWith('msg-001', 'edited');
    });

    it('requestDelete event from ChatMessage triggers deleteMessage with correct messageId', async () => {
      mockMessages.value = [ownMessage];
      mockDeleteMessage.mockResolvedValue(undefined);
      wrapper = mountWithStub();
      await flushPromises();

      await wrapper.find('.trigger-delete').trigger('click');
      await flushPromises();

      expect(mockDeleteMessage).toHaveBeenCalledWith('msg-001');
    });
  });

  describe('canModerateDelete prop (permission matrix)', () => {
    function mountWithStub() {
      return mount(ChatPanel, {
        global: {
          stubs: {
            ChatMessage: {
              name: 'ChatMessage',
              props: ['message', 'isContinuation', 'isOwn', 'canModerateDelete'],
              template: `<div :data-msg-id="message.id" :data-can-moderate-delete="String(canModerateDelete)" />`,
            },
          },
        },
      });
    }

    const viewerMessage: ChatMessage = {
      ...mockMessage,
      id: 'msg-other',
      userId: 'user-999', // someone else's message
      authorRole: 'ViewerCompany',
    };
    const modMessage: ChatMessage = {
      ...mockMessage,
      id: 'msg-mod',
      userId: 'user-mod',
      authorRole: 'Moderator',
    };
    const adminMessage: ChatMessage = {
      ...mockMessage,
      id: 'msg-admin',
      userId: 'user-admin',
      authorRole: 'Admin',
    };

    it('ViewerCompany: canModerateDelete=false for all others messages', async () => {
      mockMessages.value = [viewerMessage];
      // useAuth mock returns ViewerCompany by default
      wrapper = mountWithStub();
      await flushPromises();
      expect(wrapper.find('[data-msg-id="msg-other"]').attributes('data-can-moderate-delete')).toBe(
        'false',
      );
    });

    it('Moderator: canModerateDelete=true for ViewerCompany message', async () => {
      const { useAuth } = await import('@/composables/useAuth');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: ref({ id: 'user-001', displayName: 'Test User', avatarUrl: null, role: 'Moderator' }),
        logout: vi.fn(),
      } as never);
      mockMessages.value = [viewerMessage];
      wrapper = mountWithStub();
      await flushPromises();
      expect(wrapper.find('[data-msg-id="msg-other"]').attributes('data-can-moderate-delete')).toBe(
        'true',
      );
    });

    it('Moderator: canModerateDelete=false for Moderator message', async () => {
      const { useAuth } = await import('@/composables/useAuth');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: ref({ id: 'user-001', displayName: 'Test User', avatarUrl: null, role: 'Moderator' }),
        logout: vi.fn(),
      } as never);
      mockMessages.value = [modMessage];
      wrapper = mountWithStub();
      await flushPromises();
      expect(wrapper.find('[data-msg-id="msg-mod"]').attributes('data-can-moderate-delete')).toBe(
        'false',
      );
    });

    it('Admin: canModerateDelete=true for Moderator message', async () => {
      const { useAuth } = await import('@/composables/useAuth');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: ref({ id: 'user-001', displayName: 'Test User', avatarUrl: null, role: 'Admin' }),
        logout: vi.fn(),
      } as never);
      mockMessages.value = [modMessage];
      wrapper = mountWithStub();
      await flushPromises();
      expect(wrapper.find('[data-msg-id="msg-mod"]').attributes('data-can-moderate-delete')).toBe(
        'true',
      );
    });

    it('Admin: canModerateDelete=false for Admin message', async () => {
      const { useAuth } = await import('@/composables/useAuth');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: ref({ id: 'user-001', displayName: 'Test User', avatarUrl: null, role: 'Admin' }),
        logout: vi.fn(),
      } as never);
      mockMessages.value = [adminMessage];
      wrapper = mountWithStub();
      await flushPromises();
      expect(wrapper.find('[data-msg-id="msg-admin"]').attributes('data-can-moderate-delete')).toBe(
        'false',
      );
    });

    it('canModerateDelete=false for own message (own handled by isOwn)', async () => {
      const { useAuth } = await import('@/composables/useAuth');
      vi.mocked(useAuth).mockReturnValueOnce({
        user: ref({ id: 'user-001', displayName: 'Test User', avatarUrl: null, role: 'Admin' }),
        logout: vi.fn(),
      } as never);
      // Own message — userId matches user.id
      mockMessages.value = [{ ...adminMessage, userId: 'user-001' }];
      wrapper = mountWithStub();
      await flushPromises();
      expect(wrapper.find('[data-msg-id="msg-admin"]').attributes('data-can-moderate-delete')).toBe(
        'false',
      );
    });
  });
});

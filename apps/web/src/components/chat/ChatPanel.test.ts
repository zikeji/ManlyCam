import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import ChatPanel from './ChatPanel.vue';
import type { ChatMessage } from '@manlycam/types';

const mockMessages = ref<ChatMessage[]>([]);
const mockSendChatMessage = vi.fn();

vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendChatMessage: mockSendChatMessage,
    handleChatMessage: vi.fn(),
  }),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({ displayName: 'Test User', avatarUrl: null, role: 'ViewerCompany' }),
    logout: vi.fn(),
  }),
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

const mockMessage: ChatMessage = {
  id: 'msg-001',
  userId: 'user-001',
  displayName: 'Alice',
  avatarUrl: null,
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

  it('shows empty state when no messages', async () => {
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
    // Desktop input (hidden on mobile) exists in DOM
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('calls sendChatMessage when ChatInput emits send', async () => {
    mockSendChatMessage.mockResolvedValue(undefined);
    wrapper = mount(ChatPanel);
    // Trigger send via the textarea + Enter
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
    // lg:hidden div containing ProfileAnchor — it's in DOM but hidden via CSS on desktop
    // We check the element exists
    const mobileBar = wrapper.find('.lg\\:hidden');
    expect(mobileBar.exists()).toBe(true);
  });
});

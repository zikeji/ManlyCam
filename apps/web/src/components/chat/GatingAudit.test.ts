import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import ChatPanel from './ChatPanel.vue';
import StreamPlayer from '../stream/StreamPlayer.vue';
import PresenceList from './PresenceList.vue';
import { Role } from '@manlycam/types';

// --- Mocks ---

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);

const { mockUseAuth, mockUseChat, mockUsePresence, IconProxy, mockEphemeralMessages } = vi.hoisted(
  () => {
    const GenericIcon = {
      template: '<svg />',
    };
    const MicOffIcon = {
      template: '<svg aria-label="Muted" />',
    };
    return {
      mockUseAuth: vi.fn(),
      mockUseChat: vi.fn(),
      mockUsePresence: vi.fn(),
      mockEphemeralMessages: { value: [] as import('@manlycam/types').ChatMessage[] },
      IconProxy: new Proxy(
        {
          MicOff: MicOffIcon,
        },
        {
          get: (target, prop) => target[prop as keyof typeof target] || GenericIcon,
        },
      ),
    };
  },
);

vi.mock('@/composables/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/composables/useChat', () => ({
  useChat: mockUseChat,
  ephemeralMessages: mockEphemeralMessages,
  dismissEphemeral: vi.fn(),
  handleUserUpdate: vi.fn(),
  handleChatEdit: vi.fn(),
  handleChatDelete: vi.fn(),
  handleEphemeral: vi.fn(),
}));

vi.mock('@/composables/usePresence', () => ({
  usePresence: mockUsePresence,
  handlePresenceSeed: vi.fn(),
  handlePresenceJoin: vi.fn(),
  handlePresenceLeave: vi.fn(),
  handleTypingStart: vi.fn(),
  handleTypingStop: vi.fn(),
  handlePresenceUserUpdate: vi.fn(),
  handleModerationMuted: vi.fn(),
  handleModerationUnmuted: vi.fn(),
}));

vi.mock('@/composables/useWebSocket', () => ({
  useWebSocket: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: ref(true),
    sendTypingStart: vi.fn(),
    sendTypingStop: vi.fn(),
  }),
}));

vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: ref('live'),
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

vi.mock('@/composables/useWhep', () => ({
  useWhep: () => ({
    startWhep: vi.fn(),
    stopWhep: vi.fn(),
  }),
}));

// Stub components
vi.mock('./ChatMessage.vue', () => ({
  default: {
    name: 'ChatMessage',
    props: ['message', 'canModerateDelete', 'canMuteAuthor'],
    template: '<div class="chat-message-stub" />',
  },
}));

vi.mock('./ChatInput.vue', () => ({
  default: {
    name: 'ChatInput',
    props: ['muted'],
    template: '<div class="chat-input-stub" />',
  },
}));

// Stub UI components
vi.mock('@/components/ui/tabs', () => ({
  Tabs: { template: '<div><slot /></div>' },
  TabsList: { template: '<div><slot /></div>' },
  TabsTrigger: {
    props: ['value'],
    template: '<button :data-value="value"><slot /></button>',
  },
}));

vi.mock('reka-ui', () => ({
  TabsIndicator: { template: '<div />' },
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: { template: '<div><slot /></div>' },
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: {
    props: ['open', 'modelValue'],
    template:
      '<div><slot /><div v-if="open || modelValue" class="popover-content"><slot name="content" /></div></div>',
  },
  PopoverTrigger: { template: '<div class="popover-trigger"><slot /></div>' },
  PopoverContent: { template: '<div class="popover-content"><slot /></div>' },
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: { template: '<div><slot /></div>' },
  AvatarImage: { template: '<img />' },
  AvatarFallback: { template: '<div><slot /></div>' },
}));

vi.mock('@/components/ui/button', () => ({
  Button: { template: '<button><slot /></button>' },
}));

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: { template: '<div><slot /></div>' },
  ContextMenuTrigger: { template: '<div><slot /></div>' },
  ContextMenuContent: { template: '<div><slot /></div>' },
  ContextMenuItem: { template: '<div><slot /></div>' },
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: { template: '<div><slot /></div>' },
  AlertDialogContent: { template: '<div><slot /></div>' },
  AlertDialogHeader: { template: '<div><slot /></div>' },
  AlertDialogFooter: { template: '<div><slot /></div>' },
  AlertDialogTitle: { template: '<div><slot /></div>' },
  AlertDialogDescription: { template: '<div><slot /></div>' },
  AlertDialogAction: { template: '<div><slot /></div>' },
  AlertDialogCancel: { template: '<div><slot /></div>' },
}));

vi.mock('lucide-vue-next', () => IconProxy);

describe('Gating Audit (UI)', () => {
  const mockUser = (role: Role) => ({
    id: 'user-001',
    displayName: 'Test User',
    role,
    avatarUrl: null,
  });

  const defaultChatMock = {
    messages: ref([]),
    sendChatMessage: vi.fn(),
    initHistory: vi.fn(),
    loadMoreHistory: vi.fn(),
    hasMore: ref(false),
    isLoadingHistory: ref(false),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
  };

  const defaultPresenceMock = {
    viewers: ref([]),
    typingUsers: ref([]),
    mutedUserIds: ref(new Set()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat.mockReturnValue(defaultChatMock);
    mockUsePresence.mockReturnValue(defaultPresenceMock);
  });

  describe('ChatPanel as ViewerGuest', () => {
    it('AC 1: does not show moderation options for others messages', async () => {
      mockUseAuth.mockReturnValue({
        user: ref(mockUser(Role.ViewerGuest)),
        logout: vi.fn(),
      });

      mockUseChat.mockReturnValue({
        ...defaultChatMock,
        messages: ref([
          {
            id: 'msg-other',
            userId: 'other-user',
            displayName: 'Other User',
            authorRole: Role.ViewerCompany,
            content: 'Hello',
            createdAt: new Date().toISOString(),
          },
        ]),
      });

      const wrapper = mount(ChatPanel);
      await nextTick();

      const chatMsg = wrapper.findComponent({ name: 'ChatMessage' });
      expect(chatMsg.exists()).toBe(true);
      expect(
        chatMsg.props('canModerateDelete') === false ||
          chatMsg.props('canModerateDelete') === undefined,
      ).toBe(true);
      expect(
        chatMsg.props('canMuteAuthor') === false || chatMsg.props('canMuteAuthor') === undefined,
      ).toBe(true);
    });
  });

  describe('PresenceList', () => {
    it('AC 1: hides MicOff icon for others even if muted (as ViewerGuest)', async () => {
      const viewers = [
        {
          id: 'other',
          displayName: 'Other',
          role: Role.ViewerCompany,
          isMuted: true,
          userTag: null,
          avatarUrl: null,
        },
      ];

      const wrapper = mount(PresenceList, {
        props: {
          viewers,
          currentUserId: 'user-001',
          currentUserRole: Role.ViewerGuest,
        },
      });

      expect(wrapper.find('svg[aria-label="Muted"]').exists()).toBe(false);
    });

    it('AC 1: shows MicOff icon for others if muted (as Moderator)', async () => {
      const viewers = [
        {
          id: 'other',
          displayName: 'Other',
          role: Role.ViewerCompany,
          isMuted: true,
          userTag: null,
          avatarUrl: null,
        },
      ];

      const wrapper = mount(PresenceList, {
        props: {
          viewers,
          currentUserId: 'user-001',
          currentUserRole: Role.Moderator,
        },
      });

      expect(wrapper.find('svg[aria-label="Muted"]').exists()).toBe(true);
    });
  });

  describe('StreamPlayer as Moderator', () => {
    it('AC 2: hides Admin Panel toggle button', () => {
      mockUseAuth.mockReturnValue({
        user: ref(mockUser(Role.Moderator)),
        logout: vi.fn(),
      });

      const wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          isAdmin: false,
          isDesktop: true,
        },
      });

      expect(wrapper.find('button[aria-label*="admin panel"]').exists()).toBe(false);
    });
  });
});

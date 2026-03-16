import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';

// --- WebSocket mock ---
// jsdom doesn't implement WebSocket; we provide a controllable mock.
const mockWsInstance = {
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
  onopen: null as ((e: Event) => void) | null,
  onmessage: null as ((e: MessageEvent) => void) | null,
  onclose: null as ((e: CloseEvent) => void) | null,
  onerror: null as ((e: Event) => void) | null,
};

const MockWebSocket = vi.fn(() => {
  // Reset handlers each time a new WebSocket is created
  mockWsInstance.onopen = null;
  mockWsInstance.onmessage = null;
  mockWsInstance.onclose = null;
  mockWsInstance.onerror = null;
  mockWsInstance.readyState = 1;
  return mockWsInstance;
}) as unknown as typeof WebSocket;
(MockWebSocket as unknown as { CLOSING: number; OPEN: number; CONNECTING: number }).CLOSING = 2;
(MockWebSocket as unknown as { CLOSING: number; OPEN: number; CONNECTING: number }).OPEN = 1;
(MockWebSocket as unknown as { CLOSING: number; OPEN: number; CONNECTING: number }).CONNECTING = 0;

vi.stubGlobal('WebSocket', MockWebSocket);

// Stub window.location — jsdom sets it to about:blank context
Object.defineProperty(window, 'location', {
  value: { protocol: 'http:', host: 'localhost:5173' },
  writable: true,
});

// --- useStream mock ---
const mockSetStateFromWs = vi.fn();
vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: ref('connecting'),
    initStream: vi.fn(),
    setStateFromWs: mockSetStateFromWs,
  }),
}));

// --- useChat mock ---
const mockHandleChatEdit = vi.hoisted(() => vi.fn());
const mockHandleChatDelete = vi.hoisted(() => vi.fn());

vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    handleChatMessage: vi.fn(),
  }),
  handleUserUpdate: vi.fn(),
  handleChatEdit: mockHandleChatEdit,
  handleChatDelete: mockHandleChatDelete,
  handleEphemeral: vi.fn(),
}));

// --- usePresence mock ---
const mockHandlePresenceSeed = vi.hoisted(() => vi.fn());
const mockHandlePresenceJoin = vi.hoisted(() => vi.fn());
const mockHandlePresenceLeave = vi.hoisted(() => vi.fn());
const mockHandleTypingStart = vi.hoisted(() => vi.fn());
const mockHandleTypingStop = vi.hoisted(() => vi.fn());
const mockHandlePresenceUserUpdate = vi.hoisted(() => vi.fn());
const mockHandleModerationMuted = vi.hoisted(() => vi.fn());
const mockHandleModerationUnmuted = vi.hoisted(() => vi.fn());

vi.mock('./usePresence', () => ({
  handlePresenceSeed: mockHandlePresenceSeed,
  handlePresenceJoin: mockHandlePresenceJoin,
  handlePresenceLeave: mockHandlePresenceLeave,
  handleTypingStart: mockHandleTypingStart,
  handleTypingStop: mockHandleTypingStop,
  handlePresenceUserUpdate: mockHandlePresenceUserUpdate,
  handleModerationMuted: mockHandleModerationMuted,
  handleModerationUnmuted: mockHandleModerationUnmuted,
}));

// --- usePiSugar mock ---
const mockSetPiSugarStateFromWs = vi.hoisted(() => vi.fn());
vi.mock('./usePiSugar', () => ({
  setStateFromWs: mockSetPiSugarStateFromWs,
}));

// --- useUserCache mock ---
const mockLookupUser = vi.hoisted(() =>
  vi.fn<(id: string) => { displayName: string } | undefined>().mockReturnValue(undefined),
);
vi.mock('./useUserCache', () => ({
  cacheUsers: vi.fn(),
  lookupUser: mockLookupUser,
}));

// --- useBrowserNotifications mock ---
const mockShowNotification = vi.hoisted(() => vi.fn());
vi.mock('./useBrowserNotifications', () => ({
  useBrowserNotifications: () => ({
    requestPermission: vi.fn(),
    showNotification: mockShowNotification,
  }),
}));

// --- useNotificationPreferences mock ---
// Use a plain object to mimic a ref (cannot use vue's ref inside vi.hoisted)
const mockNotificationPreferences = vi.hoisted(() => ({
  value: {
    chatMessages: true,
    mentions: true,
    streamState: true,
    flashTitlebar: true,
  },
}));
vi.mock('./useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: mockNotificationPreferences,
    updatePreference: vi.fn(),
  }),
}));

// --- useAuth mock ---
const mockAuthUser = vi.hoisted(() => ({
  value: { id: 'user-self', displayName: 'Self' } as { id: string; displayName: string } | null,
}));
vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    fetchCurrentUser: vi.fn(),
    logout: vi.fn(),
  }),
}));

// --- router mock ---
const mockRouterPush = vi.hoisted(() => vi.fn());
vi.mock('@/router', () => ({
  router: { push: mockRouterPush },
}));

// Import AFTER mocks (important for module reset isolation)
import { useWebSocket } from './useWebSocket';
import * as useChatModule from './useChat';

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWsInstance.readyState = 1;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('connect()', () => {
    it('opens WebSocket to correct URL (ws: in dev)', () => {
      const { connect } = useWebSocket();
      connect();
      expect(MockWebSocket).toHaveBeenCalledWith('ws://localhost:5173/ws');
    });

    it('opens WebSocket with wss: when page protocol is https:', () => {
      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', host: 'example.com' },
        writable: true,
      });
      const { connect } = useWebSocket();
      connect();
      expect(MockWebSocket).toHaveBeenCalledWith('wss://example.com/ws');
      Object.defineProperty(window, 'location', {
        value: { protocol: 'http:', host: 'localhost:5173' },
        writable: true,
      });
    });

    it('does not open a second socket when already connected', () => {
      mockWsInstance.readyState = 1; // OPEN
      const { connect } = useWebSocket();
      connect();
      connect(); // second call — should be ignored
      expect(MockWebSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('onopen handler', () => {
    it('sets isConnected to true and resets backoff', () => {
      const { connect, isConnected } = useWebSocket();
      connect();
      mockWsInstance.readyState = 3; // pretend closed so connect() re-creates
      mockWsInstance.onclose?.({} as CloseEvent); // trigger backoff
      vi.advanceTimersByTime(1000);

      mockWsInstance.onopen?.(new Event('open'));
      expect(isConnected.value).toBe(true);
    });
  });

  describe('onmessage handler', () => {
    it('dispatches stream:state payload to useStream().setStateFromWs()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { state: 'live' as const };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'stream:state', payload }) }),
      );
      expect(mockSetStateFromWs).toHaveBeenCalledWith(payload);
    });

    it('ignores unknown message types without throwing', () => {
      const { connect } = useWebSocket();
      connect();
      expect(() => {
        mockWsInstance.onmessage?.(
          new MessageEvent('message', {
            data: JSON.stringify({ type: 'unknown:type', payload: {} }),
          }),
        );
      }).not.toThrow();
      expect(mockSetStateFromWs).not.toHaveBeenCalled();
    });

    it('ignores malformed JSON without throwing', () => {
      const { connect } = useWebSocket();
      connect();
      expect(() => {
        mockWsInstance.onmessage?.(new MessageEvent('message', { data: 'not-json{{{' }));
      }).not.toThrow();
    });

    it('dispatches user:update payload to handleUserUpdate() AND handlePresenceUserUpdate()', () => {
      const { connect } = useWebSocket();
      connect();
      const profile = {
        id: 'user-001',
        displayName: 'Alice Updated',
        avatarUrl: null,
        role: 'ViewerCompany',
        isMuted: false,
        userTag: null,
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'user:update', payload: profile }),
        }),
      );
      expect(vi.mocked(useChatModule.handleUserUpdate)).toHaveBeenCalledWith(profile);
      expect(mockHandlePresenceUserUpdate).toHaveBeenCalledWith(profile);
    });

    it('dispatches chat:edit payload to handleChatEdit()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = {
        messageId: 'msg-001',
        content: 'Edited',
        editHistory: [{ content: 'Original', editedAt: '2026-03-08T10:00:00.000Z' }],
        updatedAt: '2026-03-08T11:00:00.000Z',
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'chat:edit', payload }),
        }),
      );
      expect(mockHandleChatEdit).toHaveBeenCalledWith(payload);
    });

    it('dispatches chat:delete payload.messageId to handleChatDelete()', () => {
      const { connect } = useWebSocket();
      connect();
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'chat:delete', payload: { messageId: 'msg-001' } }),
        }),
      );
      expect(mockHandleChatDelete).toHaveBeenCalledWith('msg-001');
    });

    it('dispatches presence:seed payload to handlePresenceSeed()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = [
        {
          id: 'user-001',
          displayName: 'Alice',
          avatarUrl: null,
          role: 'ViewerCompany',
          isMuted: false,
          userTag: null,
        },
      ];
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'presence:seed', payload }) }),
      );
      expect(mockHandlePresenceSeed).toHaveBeenCalledWith(payload);
    });

    it('dispatches presence:join payload to handlePresenceJoin()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = {
        id: 'user-002',
        displayName: 'Bob',
        avatarUrl: null,
        role: 'Admin',
        isMuted: false,
        userTag: null,
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'presence:join', payload }) }),
      );
      expect(mockHandlePresenceJoin).toHaveBeenCalledWith(payload);
    });

    it('dispatches presence:leave payload to handlePresenceLeave()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { userId: 'user-001' };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'presence:leave', payload }) }),
      );
      expect(mockHandlePresenceLeave).toHaveBeenCalledWith(payload);
    });

    it('dispatches typing:start payload to handleTypingStart()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { userId: 'user-001', displayName: 'Alice' };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'typing:start', payload }) }),
      );
      expect(mockHandleTypingStart).toHaveBeenCalledWith(payload);
    });

    it('dispatches moderation:muted payload to handleModerationMuted()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { userId: 'user-001' };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'moderation:muted', payload }),
        }),
      );
      expect(mockHandleModerationMuted).toHaveBeenCalledWith(payload);
    });

    it('dispatches moderation:unmuted payload to handleModerationUnmuted()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { userId: 'user-001' };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'moderation:unmuted', payload }),
        }),
      );
      expect(mockHandleModerationUnmuted).toHaveBeenCalledWith(payload);
    });

    it('dispatches typing:stop payload to handleTypingStop()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { userId: 'user-001' };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'typing:stop', payload }) }),
      );
      expect(mockHandleTypingStop).toHaveBeenCalledWith(payload);
    });

    it('dispatches chat:message payload to handleChatMessage() and caches sender', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = {
        id: 'msg-001',
        userId: 'user-001',
        displayName: 'Alice',
        avatarUrl: null,
        authorRole: 'Admin' as const,
        userTag: null,
        content: 'hello',
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      expect(() => {
        mockWsInstance.onmessage?.(
          new MessageEvent('message', { data: JSON.stringify({ type: 'chat:message', payload }) }),
        );
      }).not.toThrow();
    });

    it('dispatches pisugar:status payload to setPiSugarStateFromWs()', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = { batteryLevel: 85, isCharging: true };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'pisugar:status', payload }) }),
      );
      expect(mockSetPiSugarStateFromWs).toHaveBeenCalledWith(payload);
    });

    it('redirects to /banned on session:revoked message', () => {
      const { connect } = useWebSocket();
      connect();
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'session:revoked', payload: { reason: 'banned' } }),
        }),
      );
      expect(mockRouterPush).toHaveBeenCalledWith('/banned');
    });

    it('handles users:info message without throwing', () => {
      const { connect } = useWebSocket();
      connect();
      const payload = [
        {
          id: 'user-001',
          displayName: 'Alice',
          avatarUrl: null,
          role: 'Admin',
          isMuted: false,
          userTag: null,
        },
      ];
      expect(() => {
        mockWsInstance.onmessage?.(
          new MessageEvent('message', { data: JSON.stringify({ type: 'users:info', payload }) }),
        );
      }).not.toThrow();
    });
  });

  describe('onclose handler — backoff reconnect', () => {
    it('sets isConnected to false on close', () => {
      const { connect, isConnected } = useWebSocket();
      connect();
      mockWsInstance.onopen?.(new Event('open'));
      expect(isConnected.value).toBe(true);
      mockWsInstance.readyState = 3;
      mockWsInstance.onclose?.({} as CloseEvent);
      expect(isConnected.value).toBe(false);
    });

    it('schedules reconnect after initial backoff delay (1000 ms)', () => {
      const { connect } = useWebSocket();
      connect();
      mockWsInstance.readyState = 3;
      mockWsInstance.onclose?.({} as CloseEvent);

      vi.advanceTimersByTime(999);
      expect(MockWebSocket).toHaveBeenCalledTimes(1); // not reconnected yet

      vi.advanceTimersByTime(1);
      expect(MockWebSocket).toHaveBeenCalledTimes(2); // reconnected
    });

    it('doubles the backoff delay on repeated failures, capped at 30 000 ms', () => {
      const { connect } = useWebSocket();
      connect();

      // Simulate repeated close → reconnect cycle without onopen (backoff accumulates)
      const simulateClose = () => {
        mockWsInstance.readyState = 3;
        mockWsInstance.onclose?.({} as CloseEvent);
      };

      // 1st close: delay = 1000 ms → next delay = 2000
      simulateClose();
      vi.advanceTimersByTime(1000);

      // 2nd close: delay = 2000 ms → next delay = 4000
      simulateClose();
      vi.advanceTimersByTime(2000);

      // 3rd close: delay = 4000 ms → next delay = 8000
      simulateClose();
      vi.advanceTimersByTime(4000);

      // 4th close: delay = 8000 → next = 16000
      simulateClose();
      vi.advanceTimersByTime(8000);

      // 5th close: delay = 16000 → next = 30000 (capped)
      simulateClose();
      vi.advanceTimersByTime(16000);

      // 6th close: delay = 30000 (capped, not 32000)
      simulateClose();
      vi.advanceTimersByTime(29999);
      const callsBefore = vi.mocked(MockWebSocket).mock.calls.length;
      vi.advanceTimersByTime(1);
      expect(vi.mocked(MockWebSocket).mock.calls.length).toBe(callsBefore + 1);
    });
  });

  describe('onerror handler', () => {
    it('closes the socket (which triggers onclose → backoff reconnect)', () => {
      const { connect } = useWebSocket();
      connect();
      mockWsInstance.onerror?.(new Event('error'));
      expect(mockWsInstance.close).toHaveBeenCalled();
    });
  });

  describe('disconnect()', () => {
    it('cancels pending reconnect timer', () => {
      const { connect, disconnect, isConnected } = useWebSocket();
      connect();
      mockWsInstance.readyState = 3;
      mockWsInstance.onclose?.({} as CloseEvent); // socket = null, schedules reconnect at 1000 ms

      disconnect(); // cancel the timer

      vi.advanceTimersByTime(2000);
      expect(MockWebSocket).toHaveBeenCalledTimes(1); // no reconnect happened
      expect(isConnected.value).toBe(false);
    });

    it('closes an open socket immediately', () => {
      const { connect, disconnect } = useWebSocket();
      connect();
      // socket is open, don't trigger onclose — disconnect should close it
      disconnect();
      expect(mockWsInstance.close).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('starts as false', () => {
      const { isConnected } = useWebSocket();
      expect(isConnected.value).toBe(false);
    });

    it('becomes true on open, false on close', () => {
      const { connect, isConnected } = useWebSocket();
      connect();
      mockWsInstance.onopen?.(new Event('open'));
      expect(isConnected.value).toBe(true);
      mockWsInstance.readyState = 3;
      mockWsInstance.onclose?.({} as CloseEvent);
      expect(isConnected.value).toBe(false);
    });
  });

  describe('stream notification (8-3)', () => {
    it('shows stream notification when state transitions from connecting to live', () => {
      const { connect } = useWebSocket();
      connect();

      // First message — sets prevStreamState = 'connecting', before=null → no notification
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'stream:state', payload: { state: 'connecting' } }),
        }),
      );
      expect(mockShowNotification).not.toHaveBeenCalled();

      // Second message — before='connecting', after='live' → notification fires
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'stream:state', payload: { state: 'live' } }),
        }),
      );
      expect(mockShowNotification).toHaveBeenCalledWith('Stream Update', {
        body: 'Stream is now live!',
      });
    });

    it('shows offline notification when stream goes from live to explicit-offline', () => {
      const { connect } = useWebSocket();
      connect();

      // Prime prevStreamState
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'stream:state', payload: { state: 'live' } }),
        }),
      );

      mockShowNotification.mockClear();

      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'stream:state', payload: { state: 'explicit-offline' } }),
        }),
      );
      expect(mockShowNotification).toHaveBeenCalledWith('Stream Update', {
        body: 'Stream has gone offline.',
      });
    });

    it('does not show stream notification when streamState preference is disabled', () => {
      mockNotificationPreferences.value.streamState = false;
      const { connect } = useWebSocket();
      connect();

      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'stream:state', payload: { state: 'live' } }),
        }),
      );
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'stream:state', payload: { state: 'explicit-offline' } }),
        }),
      );
      expect(mockShowNotification).not.toHaveBeenCalled();
      mockNotificationPreferences.value.streamState = true;
    });
  });

  describe('chat notification (8-3)', () => {
    it('shows chat message notification when chatMessages preference is enabled', () => {
      const { connect } = useWebSocket();
      connect();

      const payload = {
        id: 'msg-002',
        userId: 'user-other',
        displayName: 'Alice',
        avatarUrl: null,
        authorRole: 'ViewerCompany' as const,
        userTag: null,
        content: 'hello world',
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'chat:message', payload }) }),
      );
      expect(mockShowNotification).toHaveBeenCalledWith('Alice', { body: 'hello world' });
    });

    it('shows mention notification when current user is mentioned', () => {
      const { connect } = useWebSocket();
      connect();

      // Make lookupUser resolve user-self to 'Self' for token replacement
      mockLookupUser.mockImplementation((id: string) =>
        id === 'user-self' ? { displayName: 'Self' } : undefined,
      );

      const payload = {
        id: 'msg-003',
        userId: 'user-other',
        displayName: 'Alice',
        avatarUrl: null,
        authorRole: 'ViewerCompany' as const,
        userTag: null,
        content: 'hey <@user-self> check this out',
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'chat:message', payload }) }),
      );
      expect(mockShowNotification).toHaveBeenCalledWith(
        'You were mentioned',
        expect.objectContaining({ body: 'Alice: hey @Self check this out' }),
      );

      mockLookupUser.mockReturnValue(undefined);
    });

    it('does not show chat notification when chatMessages preference is disabled', () => {
      mockNotificationPreferences.value.chatMessages = false;
      const { connect } = useWebSocket();
      connect();

      const payload = {
        id: 'msg-004',
        userId: 'user-other',
        displayName: 'Bob',
        avatarUrl: null,
        authorRole: 'ViewerCompany' as const,
        userTag: null,
        content: 'hello',
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'chat:message', payload }) }),
      );
      expect(mockShowNotification).not.toHaveBeenCalled();
      mockNotificationPreferences.value.chatMessages = true;
    });

    it('does not show notification for own messages', () => {
      const { connect } = useWebSocket();
      connect();

      const payload = {
        id: 'msg-005',
        userId: 'user-self', // same as mockAuthUser.value.id
        displayName: 'Self',
        avatarUrl: null,
        authorRole: 'ViewerCompany' as const,
        userTag: null,
        content: 'my own message',
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: JSON.stringify({ type: 'chat:message', payload }) }),
      );
      expect(mockShowNotification).not.toHaveBeenCalled();
    });
  });

  describe('sendTypingStart / sendTypingStop', () => {
    it('sendTypingStart sends typing:start when socket is open', () => {
      const { connect, sendTypingStart } = useWebSocket();
      connect();
      mockWsInstance.readyState = 1; // OPEN
      sendTypingStart();
      expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'typing:start' }));
    });

    it('sendTypingStop sends typing:stop when socket is open', () => {
      const { connect, sendTypingStop } = useWebSocket();
      connect();
      mockWsInstance.readyState = 1; // OPEN
      sendTypingStop();
      expect(mockWsInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'typing:stop' }));
    });

    it('sendTypingStart does not send when socket is not OPEN', () => {
      const { connect, sendTypingStart } = useWebSocket();
      connect();
      mockWsInstance.readyState = 3; // CLOSED
      sendTypingStart();
      expect(mockWsInstance.send).not.toHaveBeenCalled();
    });
  });
});

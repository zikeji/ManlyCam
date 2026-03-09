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
const mockHandleUserUpdate = vi.fn();
const mockHandleChatMessage = vi.fn();
vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    handleChatMessage: mockHandleChatMessage,
    handleUserUpdate: mockHandleUserUpdate,
  }),
}));

// Import AFTER mocks (important for module reset isolation)
import { useWebSocket } from './useWebSocket';

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleUserUpdate.mockReset();
    mockHandleChatMessage.mockReset();
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

    it('dispatches user:update payload to useChat().handleUserUpdate()', () => {
      const { connect } = useWebSocket();
      connect();
      const profile = {
        id: 'user-001',
        displayName: 'Alice Updated',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTag: null,
      };
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'user:update', payload: profile }),
        }),
      );
      expect(mockHandleUserUpdate).toHaveBeenCalledWith(profile);
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
});

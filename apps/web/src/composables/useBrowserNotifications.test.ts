import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

class MockNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => MockNotification.permission);

  title: string;
  options?: NotificationOptions;
  onclick: (() => void) | null = null;

  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }

  close = vi.fn();

  static instances: MockNotification[] = [];
  static reset() {
    MockNotification.permission = 'granted';
    MockNotification.requestPermission = vi.fn(async () => MockNotification.permission);
    MockNotification.instances = [];
  }
}

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  static channels: MockBroadcastChannel[] = [];
  private _closed = false;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.channels.push(this);
  }

  postMessage(data: unknown) {
    if (this._closed) return;
    // Deliver to all OTHER channels with the same name (simulating real BroadcastChannel)
    MockBroadcastChannel.channels
      .filter((ch) => ch !== this && ch.name === this.name && !ch._closed)
      .forEach((ch) => {
        ch.onmessage?.(new MessageEvent('message', { data }));
      });
  }

  close() {
    this._closed = true;
  }

  static reset() {
    MockBroadcastChannel.channels = [];
  }
}

vi.stubGlobal('Notification', MockNotification);
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

describe('useBrowserNotifications', () => {
  beforeEach(async () => {
    MockNotification.reset();
    MockBroadcastChannel.reset();
    vi.clearAllMocks();

    // Reset module between tests to reset module-level state (isLeader, channel)
    vi.resetModules();
  });

  it('requestPermission returns granted when permission is already granted', async () => {
    MockNotification.permission = 'granted';
    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { requestPermission } = useBrowserNotifications();

    const result = await requestPermission();
    expect(result).toBe('granted');
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('requestPermission calls Notification.requestPermission when permission is default', async () => {
    MockNotification.permission = 'default';
    MockNotification.requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { requestPermission } = useBrowserNotifications();

    const result = await requestPermission();
    expect(MockNotification.requestPermission).toHaveBeenCalled();
    expect(result).toBe('granted');
  });

  it('requestPermission returns denied when Notification not in window', async () => {
    const savedNotification = window.Notification;
    // @ts-expect-error intentionally removing
    delete window.Notification;

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { requestPermission } = useBrowserNotifications();
    const result = await requestPermission();

    expect(result).toBe('denied');

    // Restore
    vi.stubGlobal('Notification', savedNotification);
  });

  it('showNotification shows notification even when tab is visible', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    MockNotification.permission = 'granted';
    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    showNotification('Test', { body: 'hello' });
    await new Promise((r) => setTimeout(r, 200));

    expect(MockNotification.instances).toHaveLength(1);
  });

  it('showNotification does nothing when Notification is not in window', async () => {
    const savedNotification = window.Notification;
    // @ts-expect-error intentionally removing
    delete window.Notification;

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();
    showNotification('Test', { body: 'hello' });
    await new Promise((r) => setTimeout(r, 200));

    expect(MockNotification.instances).toHaveLength(0);

    vi.stubGlobal('Notification', savedNotification);
  });

  it('showNotification does nothing when permission is not granted', async () => {
    MockNotification.permission = 'denied';

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    showNotification('Test', { body: 'hello' });
    await new Promise((r) => setTimeout(r, 200));

    expect(MockNotification.instances).toHaveLength(0);
  });

  it('showNotification creates a Notification when permission granted', async () => {
    MockNotification.permission = 'granted';

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    showNotification('Test Title', { body: 'Test body' });
    await new Promise((r) => setTimeout(r, 200));

    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0].title).toBe('Test Title');
    expect(MockNotification.instances[0].options?.body).toBe('Test body');
  });

  it('showNotification uses tag "manlycam" for deduplication', async () => {
    MockNotification.permission = 'granted';

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    showNotification('Test', { body: 'hello' });
    await new Promise((r) => setTimeout(r, 200));

    expect(MockNotification.instances[0].options?.tag).toBe('manlycam');
  });

  it('notification.onclick focuses window and closes notification', async () => {
    MockNotification.permission = 'granted';
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    showNotification('Test Title', { body: 'Test body' });
    await new Promise((r) => setTimeout(r, 200));

    expect(MockNotification.instances).toHaveLength(1);
    const notification = MockNotification.instances[0];

    expect(notification.onclick).not.toBeNull();
    notification.onclick!();

    expect(focusSpy).toHaveBeenCalled();
    expect(notification.close).toHaveBeenCalled();
  });

  it('showNotification works correctly on second call (channel already initialized)', async () => {
    MockNotification.permission = 'granted';

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    // First call initializes channel
    showNotification('First', { body: 'first' });
    await new Promise((r) => setTimeout(r, 200));
    expect(MockNotification.instances).toHaveLength(1);

    MockNotification.instances = [];

    // Second call reuses existing channel (covers `if (channel) return;` early return)
    showNotification('Second', { body: 'second' });
    await new Promise((r) => setTimeout(r, 200));
    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0].title).toBe('Second');
  });

  it('showNotification does nothing when leader is lost before timeout (isLeader=false branch)', async () => {
    vi.useFakeTimers();
    MockNotification.permission = 'granted';

    const { useBrowserNotifications } = await import('./useBrowserNotifications');
    const { showNotification } = useBrowserNotifications();

    showNotification('Test', { body: 'hello' });

    const ch = MockBroadcastChannel.channels[0];
    ch.onmessage?.(new MessageEvent('message', { data: { type: 'claim-leader' } }));

    vi.advanceTimersByTime(200);

    expect(MockNotification.instances).toHaveLength(0);
    vi.useRealTimers();
  });

  it('tab coordination: only one notification is shown across two tabs (AC #7)', async () => {
    MockNotification.permission = 'granted';

    // Two separate module instances simulate two tabs
    const mod1 = await import('./useBrowserNotifications');

    vi.resetModules();
    const mod2 = await import('./useBrowserNotifications');

    const { showNotification: show1 } = mod1.useBrowserNotifications();
    const { showNotification: show2 } = mod2.useBrowserNotifications();

    // Both tabs try to show a notification at the same time
    show1('From Tab 1', { body: 'hello' });
    show2('From Tab 2', { body: 'world' });

    await new Promise((r) => setTimeout(r, 300));

    // Only one notification should be created (leader wins, follower yields)
    expect(MockNotification.instances).toHaveLength(1);
  });
});

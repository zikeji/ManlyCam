import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import BroadcastConsole from './BroadcastConsole.vue';
import { Role } from '@manlycam/types';
import { piSugarStatus } from '@/composables/usePiSugar';

// Mock useSnapshot composable
const mockTakeSnapshot = vi.fn();
vi.mock('@/composables/useSnapshot', () => ({
  useSnapshot: () => ({
    takeSnapshot: mockTakeSnapshot,
  }),
}));

// Mock PreferencesDialog to avoid pulling in Dialog/Switch/notification deps
vi.mock('@/components/preferences/PreferencesDialog.vue', () => ({
  default: {
    name: 'PreferencesDialog',
    template: '<div data-testid="preferences-dialog"></div>',
    props: ['open'],
    emits: ['update:open'],
  },
}));

const mockStartStream = vi.fn().mockResolvedValue(undefined);
const mockStopStream = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockIsLoading = ref(false);

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({ id: '1', displayName: 'Admin User', avatarUrl: '', role: Role.Admin }),
    logout: mockLogout,
    fetchCurrentUser: vi.fn(),
  }),
}));

vi.mock('@/composables/useAdminStream', () => ({
  useAdminStream: () => ({
    startStream: mockStartStream,
    stopStream: mockStopStream,
    isLoading: mockIsLoading,
    error: ref(null),
  }),
}));

vi.mock('@/composables/usePresence', () => ({
  viewers: ref([
    { id: '1', displayName: 'Alice' },
    { id: '2', displayName: 'Bob' },
  ]),
}));

// Mock ResizeObserver for Popover
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('BroadcastConsole', () => {
  let wrapper: VueWrapper<InstanceType<typeof BroadcastConsole>> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading.value = false;
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
  });

  const mountConsole = (props = {}) => {
    wrapper = mount(BroadcastConsole, {
      props: {
        streamState: 'live',
        ...props,
      },
      global: {
        stubs: {
          StreamStatusBadge: true,
          Settings2: true,
          Play: true,
          Square: true,
          Camera: true,
          MessageSquare: true,
        },
      },
    });
    return wrapper;
  };

  it('renders left flank admin controls when isAdmin is true on desktop', () => {
    wrapper = mountConsole({ isAdmin: true, isDesktop: true });
    expect(wrapper.find('button[aria-label="Show camera controls"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Stop Stream"]').exists()).toBe(true);
  });

  it('hides left flank admin icon controls when isAdmin is false', () => {
    wrapper = mountConsole({ isAdmin: false });
    expect(wrapper.find('button[aria-label="Show camera controls"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Stop Stream"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Start Stream"]').exists()).toBe(false);
  });

  it('hides admin icon controls on mobile (isDesktop: false)', () => {
    wrapper = mountConsole({ isAdmin: true, isDesktop: false });
    expect(wrapper.find('button[aria-label="Show camera controls"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Stop Stream"]').exists()).toBe(false);
  });

  it('shows chat collapse in left flank on mobile', () => {
    wrapper = mountConsole({ isDesktop: false, showChatToggle: true });
    // Left flank collapse button rendered before profile popover
    const allButtons = wrapper.findAll('button');
    const collapseIdx = allButtons.findIndex((b) =>
      b.attributes('aria-label')?.includes('chat sidebar'),
    );
    const avatarIdx = allButtons.findIndex((b) => b.attributes('aria-label') === 'Account menu');
    expect(collapseIdx).toBeGreaterThanOrEqual(0);
    expect(collapseIdx).toBeLessThan(avatarIdx);
  });

  it('hides chat collapse from right flank on mobile', () => {
    wrapper = mountConsole({ isDesktop: false, showChatToggle: true });
    // On mobile, right flank collapse is hidden; only left flank collapse exists
    const collapseButtons = wrapper
      .findAll('button')
      .filter((b) => b.attributes('aria-label')?.includes('chat sidebar'));
    // Only 1 collapse button (left flank), not 2
    expect(collapseButtons.length).toBe(1);
  });

  it('emits toggleAdminPanel when Camera Controls button is clicked', async () => {
    wrapper = mountConsole({ isAdmin: true });
    const settingsBtn = wrapper.find('button[aria-label="Show camera controls"]');
    await settingsBtn.trigger('click');
    expect(wrapper.emitted('toggleAdminPanel')).toBeTruthy();
  });

  it('calls useAdminStream stopStream when stream toggle clicked while live', async () => {
    wrapper = mountConsole({ isAdmin: true, streamState: 'live' });
    const toggleBtn = wrapper.find('button[aria-label="Stop Stream"]');
    await toggleBtn.trigger('click');
    expect(mockStopStream).toHaveBeenCalled();
  });

  it('calls useAdminStream startStream when stream toggle clicked while explicit-offline', async () => {
    wrapper = mountConsole({ isAdmin: true, streamState: 'explicit-offline' });
    const toggleBtn = wrapper.find('button[aria-label="Start Stream"]');
    await toggleBtn.trigger('click');
    expect(mockStartStream).toHaveBeenCalled();
  });

  it('renders StreamStatusBadge with correct state prop', () => {
    wrapper = mountConsole({ streamState: 'connecting' });
    const badge = wrapper.findComponent({ name: 'StreamStatusBadge' });
    expect(badge.exists()).toBe(true);
    expect(badge.props('state')).toBe('connecting');
  });

  it('displays correct viewer count', () => {
    wrapper = mountConsole();
    expect(wrapper.text()).toContain('2 viewers');
  });

  it('emits toggleChatSidebar when chat toggle button is clicked', async () => {
    wrapper = mountConsole();
    // Find message square icon parent button
    const chatBtn = wrapper.find('button[aria-label="Expand chat sidebar"]');
    await chatBtn.trigger('click');
    expect(wrapper.emitted('toggleChatSidebar')).toBeTruthy();
  });

  it('shows unread badge when !chatSidebarOpen && unreadCount > 0', () => {
    wrapper = mountConsole({ chatSidebarOpen: false, unreadCount: 5 });
    const badge = wrapper.find('.absolute.top-0.right-0');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('5');
  });

  it('hides unread badge when chatSidebarOpen is true', () => {
    wrapper = mountConsole({ chatSidebarOpen: true, unreadCount: 5 });
    const badge = wrapper.find('.absolute.top-0.right-0');
    expect(badge.exists()).toBe(false);
  });

  it('profile popover on desktop contains username but NO stream toggle button', async () => {
    wrapper = mountConsole({ isAdmin: true, isDesktop: true });
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    const popoverContent = document.querySelector('[role="dialog"]') || wrapper.element;
    expect(popoverContent.textContent).toContain('Admin User');
    expect(popoverContent.textContent).not.toContain('Start Stream');
    expect(popoverContent.textContent).not.toContain('Stop Stream');
  });

  it('profile popover on mobile contains stream toggle for admin', async () => {
    wrapper = mountConsole({ isAdmin: true, isDesktop: false, streamState: 'explicit-offline' });
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    const body = document.body.innerHTML;
    expect(body).toContain('Start Stream');
  });

  it('profile popover stream toggle on mobile calls startStream', async () => {
    wrapper = mountConsole({ isAdmin: true, isDesktop: false, streamState: 'explicit-offline' });
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    // Find the Start Stream button in the popover (inside document.body)
    const startBtn = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === 'Start Stream',
    ) as HTMLButtonElement | undefined;
    startBtn?.click();
    await flushPromises();

    expect(mockStartStream).toHaveBeenCalled();
  });

  // 8-3: Preferences button (AC #2, #3)
  it('renders Preferences button in profile popover', async () => {
    wrapper = mountConsole();
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    const body = document.body.innerHTML;
    expect(body).toContain('Preferences');
  });

  it('opens preferences dialog when Preferences button is clicked', async () => {
    wrapper = mountConsole();
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    const prefsBtn = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === 'Preferences',
    ) as HTMLButtonElement | undefined;
    prefsBtn?.click();
    await flushPromises();

    // PreferencesDialog should now be visible (open prop = true)
    const dialog = wrapper.findComponent({ name: 'PreferencesDialog' });
    expect(dialog.props('open')).toBe(true);
  });

  // 7-4: BatteryIndicator integration tests (AC #12, #6)
  describe('BatteryIndicator integration', () => {
    afterEach(() => {
      piSugarStatus.value = null;
    });

    it('hides BatteryIndicator when piSugarStatus is null (AC #12)', () => {
      piSugarStatus.value = null;
      wrapper = mountConsole({ isAdmin: true });
      // BatteryIndicator should not be rendered
      const batteryBtn = wrapper
        .findAll('button')
        .find((btn) => btn.html().includes('lucide-battery'));
      expect(batteryBtn).toBeUndefined();
    });

    it('shows BatteryIndicator when piSugarStatus is set and isAdmin (AC #6)', async () => {
      piSugarStatus.value = {
        connected: true,
        level: 80,
        plugged: false,
        charging: false,
        chargingRange: null,
      };
      wrapper = mountConsole({ isAdmin: true });
      await flushPromises();
      const batteryBtn = wrapper
        .findAll('button')
        .find((btn) => btn.html().includes('lucide-battery'));
      expect(batteryBtn).toBeDefined();
    });

    it('hides BatteryIndicator when not admin even if piSugarStatus is set (AC #12)', async () => {
      piSugarStatus.value = {
        connected: true,
        level: 80,
        plugged: false,
        charging: false,
        chargingRange: null,
      };
      wrapper = mountConsole({ isAdmin: false });
      await flushPromises();
      const batteryBtn = wrapper
        .findAll('button')
        .find((btn) => btn.html().includes('lucide-battery'));
      expect(batteryBtn).toBeUndefined();
    });
  });

  // 7-3: snapshot button tests
  it('renders snapshot button (not hidden)', () => {
    wrapper = mountConsole();
    const buttons = wrapper.findAll('button');
    // Snapshot button contains Camera icon
    const snapshotBtn = buttons.find((btn) => btn.html().includes('lucide-camera'));
    expect(snapshotBtn?.exists()).toBe(true);
  });

  it('snapshot button is enabled when streamState is live', () => {
    wrapper = mountConsole({ streamState: 'live' });
    const buttons = wrapper.findAll('button');
    const snapshotBtn = buttons.find((btn) => btn.html().includes('lucide-camera'));
    expect(snapshotBtn?.attributes('disabled')).toBeUndefined();
  });

  it('snapshot button is disabled when streamState is not live', () => {
    wrapper = mountConsole({ streamState: 'connecting' });
    const buttons = wrapper.findAll('button');
    const snapshotBtn = buttons.find((btn) => btn.html().includes('lucide-camera'));
    expect(snapshotBtn?.attributes('disabled')).toBeDefined();
  });

  it('snapshot button shows "Take Snapshot" tooltip when live', () => {
    wrapper = mountConsole({ streamState: 'live' });
    const buttons = wrapper.findAll('button');
    const snapshotBtn = buttons.find((btn) => btn.html().includes('lucide-camera'));
    expect(snapshotBtn?.attributes('title')).toBe('Take Snapshot');
  });

  it('snapshot button shows "Stream not live" tooltip when not live', () => {
    wrapper = mountConsole({ streamState: 'connecting' });
    const buttons = wrapper.findAll('button');
    const snapshotBtn = buttons.find((btn) => btn.html().includes('lucide-camera'));
    expect(snapshotBtn?.attributes('title')).toBe('Stream not live');
  });

  it('snapshot button calls takeSnapshot when clicked', async () => {
    const mockVideoElement = { tagName: 'VIDEO' } as HTMLVideoElement;
    wrapper = mountConsole({ streamState: 'live', videoRef: mockVideoElement });

    const buttons = wrapper.findAll('button');
    const snapshotBtn = buttons.find((btn) => btn.html().includes('lucide-camera'));
    await snapshotBtn?.trigger('click');

    expect(mockTakeSnapshot).toHaveBeenCalledWith(mockVideoElement);
  });

  it('calls logout when Log out button is clicked in profile popover', async () => {
    wrapper = mountConsole({ isAdmin: true });
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    const logoutBtn = Array.from(document.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === 'Log out',
    ) as HTMLButtonElement | undefined;
    logoutBtn?.click();
    await flushPromises();

    expect(mockLogout).toHaveBeenCalled();
  });

  it('renders loading spinner instead of VideoOff when isLoading and stream is explicit-offline', async () => {
    mockIsLoading.value = true;
    wrapper = mountConsole({ isAdmin: true, streamState: 'explicit-offline' });
    await flushPromises();
    expect(wrapper.find('.animate-spin').exists()).toBe(true);
  });

  it('renders loading spinner instead of Video when isLoading and stream is live', async () => {
    mockIsLoading.value = true;
    wrapper = mountConsole({ isAdmin: true, streamState: 'live' });
    await flushPromises();
    expect(wrapper.find('.animate-spin').exists()).toBe(true);
  });
});

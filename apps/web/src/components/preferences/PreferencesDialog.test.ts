import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import PreferencesDialog from './PreferencesDialog.vue';

// --- Mocks ---

const mockUpdatePreference = vi.fn();
const mockRequestPermission = vi.fn().mockResolvedValue('granted');

vi.mock('@/composables/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: ref({
      chatMessages: false,
      mentions: false,
      streamState: false,
      flashTitlebar: true,
    }),
    updatePreference: mockUpdatePreference,
  }),
}));

vi.mock('@/composables/useBrowserNotifications', () => ({
  useBrowserNotifications: () => ({
    requestPermission: mockRequestPermission,
    showNotification: vi.fn(),
  }),
}));

// Stub UI components — reka-ui Switch doesn't work in JSDOM; replace with a simple button
vi.mock('@/components/ui/switch', () => ({
  Switch: {
    name: 'Switch',
    props: ['modelValue', 'id'],
    template:
      '<button :id="id" role="switch" :aria-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)"></button>',
    emits: ['update:modelValue'],
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: {
    name: 'Dialog',
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open"><slot /></div>',
  },
  DialogContent: {
    name: 'DialogContent',
    template: '<div><slot /></div>',
  },
  DialogHeader: {
    name: 'DialogHeader',
    template: '<div><slot /></div>',
  },
  DialogTitle: {
    name: 'DialogTitle',
    template: '<h2><slot /></h2>',
  },
  DialogDescription: {
    name: 'DialogDescription',
    template: '<p><slot /></p>',
  },
}));

// Mock Notification global
const notificationMock = {
  permission: 'granted' as NotificationPermission,
};
vi.stubGlobal('Notification', notificationMock);

describe('PreferencesDialog', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    notificationMock.permission = 'granted';
    // Ensure requestPermission returns 'granted' by default
    mockRequestPermission.mockResolvedValue('granted');
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const mountDialog = (open = true) => {
    wrapper = mount(PreferencesDialog, { props: { open } });
    return wrapper;
  };

  it('renders dialog content when open is true', () => {
    mountDialog(true);
    expect(wrapper!.text()).toContain('Preferences');
  });

  it('does not render dialog content when open is false', () => {
    mountDialog(false);
    expect(wrapper!.text()).not.toContain('Chat messages');
  });

  it('renders all 4 toggle labels', () => {
    mountDialog(true);
    const text = wrapper!.text();
    expect(text).toContain('Chat messages');
    expect(text).toContain('@Mentions');
    expect(text).toContain('Stream state changes');
    expect(text).toContain('Flash titlebar on mention');
  });

  it('renders 4 Switch components', () => {
    mountDialog(true);
    const switches = wrapper!.findAll('[role="switch"]');
    expect(switches).toHaveLength(4);
  });

  it('shows blocked message when permission is denied', () => {
    notificationMock.permission = 'denied';
    mountDialog(true);
    expect(wrapper!.text()).toContain('Notifications are blocked');
  });

  it('does not show blocked message when permission is granted', () => {
    notificationMock.permission = 'granted';
    mountDialog(true);
    expect(wrapper!.text()).not.toContain('Notifications are blocked');
  });

  it('shows unsupported message when Notification API is not in window', () => {
    // Temporarily remove Notification from window
    const savedNotification = (window as unknown as Record<string, unknown>).Notification;
    delete (window as unknown as Record<string, unknown>).Notification;

    mountDialog(true);
    expect(wrapper!.text()).toContain('not supported');

    // Restore
    (window as unknown as Record<string, unknown>).Notification = savedNotification;
  });

  it('calls updatePreference when flashTitlebar switch is toggled', async () => {
    mountDialog(true);
    const switches = wrapper!.findAll('[role="switch"]');
    // flashTitlebar is the 4th switch
    await switches[3].trigger('click');
    await flushPromises();
    expect(mockUpdatePreference).toHaveBeenCalledWith('flashTitlebar', false);
  });

  it('calls updatePreference when chatMessages switch is toggled (permission granted)', async () => {
    notificationMock.permission = 'granted';
    mountDialog(true);
    const switches = wrapper!.findAll('[role="switch"]');
    await switches[0].trigger('click');
    await flushPromises();
    // chatMessages defaults to false, so toggling it yields true
    expect(mockUpdatePreference).toHaveBeenCalledWith('chatMessages', true);
  });

  it('calls updatePreference when mentions switch is toggled', async () => {
    notificationMock.permission = 'granted';
    mountDialog(true);
    const switches = wrapper!.findAll('[role="switch"]');
    await switches[1].trigger('click');
    await flushPromises();
    expect(mockUpdatePreference).toHaveBeenCalledWith('mentions', true);
  });

  it('calls updatePreference when streamState switch is toggled', async () => {
    notificationMock.permission = 'granted';
    mountDialog(true);
    const switches = wrapper!.findAll('[role="switch"]');
    await switches[2].trigger('click');
    await flushPromises();
    expect(mockUpdatePreference).toHaveBeenCalledWith('streamState', true);
  });

  it('requests permission when enabling a notification toggle while permission is default', async () => {
    notificationMock.permission = 'default';
    mockRequestPermission.mockResolvedValue('granted');

    mountDialog(true);
    await flushPromises();

    // Manually emit update:modelValue=true on the chatMessages Switch component
    // (simulates user turning on a disabled toggle)
    const switchComponents = wrapper!.findAllComponents({ name: 'Switch' });
    await switchComponents[0].vm.$emit('update:modelValue', true);
    await flushPromises();

    expect(mockRequestPermission).toHaveBeenCalled();
    expect(mockUpdatePreference).toHaveBeenCalledWith('chatMessages', true);
  });

  it('does not call updatePreference when permission request is denied', async () => {
    notificationMock.permission = 'default';
    mockRequestPermission.mockResolvedValue('denied');

    mountDialog(true);
    await flushPromises();

    // Emit update:modelValue=true to trigger the permission request path
    const switchComponents = wrapper!.findAllComponents({ name: 'Switch' });
    await switchComponents[0].vm.$emit('update:modelValue', true);
    await flushPromises();

    expect(mockRequestPermission).toHaveBeenCalled();
    // updatePreference should NOT be called since permission was denied
    expect(mockUpdatePreference).not.toHaveBeenCalledWith('chatMessages', true);
  });

  it('emits update:open false when dialog emits update:open', async () => {
    mountDialog(true);
    const dialog = wrapper!.findComponent({ name: 'Dialog' });
    dialog.vm.$emit('update:open', false);
    await flushPromises();
    expect(wrapper!.emitted('update:open')).toBeTruthy();
    expect(wrapper!.emitted('update:open')![0]).toEqual([false]);
  });

  it('all switch labels have for attributes (accessibility)', () => {
    mountDialog(true);
    const labels = wrapper!.findAll('label');
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => {
      expect(label.attributes('for')).toBeTruthy();
    });
  });
});

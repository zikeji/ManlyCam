import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';

const mockShutdownDevice = vi.fn();
const mockState = vi.hoisted(() => ({
  isShuttingDown: null as { value: boolean } | null,
  error: null as { value: string | null } | null,
}));

vi.mock('@/composables/useDeviceShutdown', async () => {
  const { ref } = await import('vue');
  mockState.isShuttingDown = ref(false);
  mockState.error = ref<string | null>(null);
  return {
    useDeviceShutdown: () => ({
      shutdownDevice: mockShutdownDevice,
      isShuttingDown: mockState.isShuttingDown,
      error: mockState.error,
    }),
  };
});

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

const mockOpenTerminal = vi.hoisted(() => vi.fn());
const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  apiFetch: mockApiFetch,
  ApiFetchError: class MockApiFetchError extends Error {},
}));

vi.mock('@/composables/useTerminalWindow', () => ({
  openTerminal: mockOpenTerminal,
  closeTerminal: vi.fn(),
  isTerminalOpen: { value: false },
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
  AlertDialogContent: { template: '<div><slot /></div>' },
  AlertDialogHeader: { template: '<div><slot /></div>' },
  AlertDialogTitle: { template: '<div><slot /></div>' },
  AlertDialogDescription: { template: '<div><slot /></div>' },
  AlertDialogFooter: { template: '<div><slot /></div>' },
  AlertDialogCancel: { template: '<button data-testid="cancel"><slot /></button>' },
  AlertDialogAction: { template: '<button data-testid="action"><slot /></button>' },
}));

import DeviceControls from './DeviceControls.vue';

describe('DeviceControls', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    if (mockState.isShuttingDown) mockState.isShuttingDown.value = false;
    if (mockState.error) mockState.error.value = null;
    mockShutdownDevice.mockResolvedValue(true);
    mockApiFetch.mockResolvedValue({ agentEnabled: true });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders Remote Terminal and Shutdown buttons side by side', async () => {
    wrapper = mount(DeviceControls);
    await flushPromises();
    expect(wrapper.find('[data-testid="remote-terminal-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shutdown-btn"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Terminal');
    expect(wrapper.text()).toContain('Shutdown');
  });

  it('hides the controls when the agent is not configured', async () => {
    mockApiFetch.mockResolvedValue({ agentEnabled: false });
    wrapper = mount(DeviceControls);
    await flushPromises();
    expect(wrapper.find('[data-testid="device-controls-root"]').exists()).toBe(false);
  });

  it('keeps the controls hidden when the status fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('down'));
    wrapper = mount(DeviceControls);
    await flushPromises();
    expect(wrapper.find('[data-testid="device-controls-root"]').exists()).toBe(false);
  });

  it('opens the terminal window when Terminal is clicked', async () => {
    wrapper = mount(DeviceControls);
    await flushPromises();
    await wrapper.find('[data-testid="remote-terminal-btn"]').trigger('click');
    expect(mockOpenTerminal).toHaveBeenCalledOnce();
  });

  it('opens the confirm dialog when Shutdown is clicked', async () => {
    wrapper = mount(DeviceControls);
    await flushPromises();
    expect(wrapper.find('[data-testid="shutdown-confirm-btn"]').exists()).toBe(false);
    await wrapper.find('[data-testid="shutdown-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="shutdown-confirm-btn"]').exists()).toBe(true);
  });

  it('calls shutdownDevice and toasts success on confirm', async () => {
    wrapper = mount(DeviceControls);
    await flushPromises();
    await wrapper.find('[data-testid="shutdown-btn"]').trigger('click');
    await wrapper.find('[data-testid="shutdown-confirm-btn"]').trigger('click');
    await Promise.resolve();
    expect(mockShutdownDevice).toHaveBeenCalledOnce();
    expect(mockToastSuccess).toHaveBeenCalledWith('Shutdown command sent — device is powering off');
  });

  it('toasts the error when shutdown fails', async () => {
    mockShutdownDevice.mockResolvedValue(false);
    if (mockState.error) mockState.error.value = 'Device agent unreachable';
    wrapper = mount(DeviceControls);
    await flushPromises();
    await wrapper.find('[data-testid="shutdown-btn"]').trigger('click');
    await wrapper.find('[data-testid="shutdown-confirm-btn"]').trigger('click');
    await Promise.resolve();
    expect(mockToastError).toHaveBeenCalledWith('Device agent unreachable');
  });

  it('disables the Shutdown button while shutting down', async () => {
    if (mockState.isShuttingDown) mockState.isShuttingDown.value = true;
    wrapper = mount(DeviceControls);
    await flushPromises();
    const btn = wrapper.find('[data-testid="shutdown-btn"]');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Shutting down…');
  });

  it('renders the error text when present', async () => {
    if (mockState.error) mockState.error.value = 'Device agent unreachable';
    wrapper = mount(DeviceControls);
    await flushPromises();
    expect(wrapper.find('[data-testid="shutdown-error"]').text()).toBe('Device agent unreachable');
  });
});

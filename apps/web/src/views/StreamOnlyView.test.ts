import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';

const mockStartWhep = vi.fn().mockResolvedValue(undefined);
const mockStopWhep = vi.fn().mockResolvedValue(undefined);
const mockIsHealthy = ref(false);
const mockIsConnecting = ref(false);
const mockIsPermanentlyFailed = ref(false);

vi.mock('@/composables/useStreamOnlyWhep', () => ({
  useStreamOnlyWhep: vi.fn(() => ({
    startWhep: mockStartWhep,
    stopWhep: mockStopWhep,
    isHealthy: mockIsHealthy,
    isConnecting: mockIsConnecting,
    isPermanentlyFailed: mockIsPermanentlyFailed,
  })),
}));

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { key: 'testkey123' } })),
}));

import StreamOnlyView from './StreamOnlyView.vue';

describe('StreamOnlyView', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsHealthy.value = false;
    mockIsConnecting.value = false;
    mockIsPermanentlyFailed.value = false;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders a video element', () => {
    wrapper = mount(StreamOnlyView);
    expect(wrapper.find('[data-testid="stream-video"]').exists()).toBe(true);
  });

  it('shows spinner when isConnecting is true', () => {
    mockIsConnecting.value = true;
    wrapper = mount(StreamOnlyView);
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(true);
  });

  it('shows spinner when not healthy and not permanently failed', () => {
    mockIsConnecting.value = false;
    mockIsHealthy.value = false;
    mockIsPermanentlyFailed.value = false;
    wrapper = mount(StreamOnlyView);
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(true);
  });

  it('does not show spinner when permanently failed (just black)', () => {
    mockIsConnecting.value = false;
    mockIsHealthy.value = false;
    mockIsPermanentlyFailed.value = true;
    wrapper = mount(StreamOnlyView);
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(false);
  });

  it('does not show spinner when healthy', () => {
    mockIsConnecting.value = false;
    mockIsHealthy.value = true;
    mockIsPermanentlyFailed.value = false;
    wrapper = mount(StreamOnlyView);
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(false);
  });

  it('passes the key from route params to useStreamOnlyWhep', async () => {
    const { useStreamOnlyWhep } = await import('@/composables/useStreamOnlyWhep');
    wrapper = mount(StreamOnlyView);
    expect(useStreamOnlyWhep).toHaveBeenCalledWith('testkey123');
  });

  it('calls startWhep on mount', async () => {
    wrapper = mount(StreamOnlyView);
    await Promise.resolve();
    expect(mockStartWhep).toHaveBeenCalled();
  });

  it('calls stopWhep on unmount', async () => {
    wrapper = mount(StreamOnlyView);
    wrapper.unmount();
    wrapper = null;
    await Promise.resolve();
    expect(mockStopWhep).toHaveBeenCalled();
  });
});

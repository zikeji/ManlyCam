import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';

const mockEnabled = ref(false);
const mockKey = ref<string | null>(null);
const mockIsLoading = ref(false);
const mockToggle = vi.fn();
const mockRegenerate = vi.fn();
const mockFetchConfig = vi.fn().mockResolvedValue(undefined);

vi.mock('@/composables/useStreamOnlyLink', () => ({
  useStreamOnlyLink: () => ({
    enabled: mockEnabled,
    key: mockKey,
    isLoading: mockIsLoading,
    error: ref(null),
    toggle: mockToggle,
    regenerate: mockRegenerate,
    fetchConfig: mockFetchConfig,
  }),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: {
    template:
      '<button :data-checked="modelValue" @click="$emit(\'update:modelValue\', !modelValue)"><slot /></button>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: {
    template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  },
}));

import StreamOnlyPanel from './StreamOnlyPanel.vue';

describe('StreamOnlyPanel', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnabled.value = false;
    mockKey.value = null;
    mockIsLoading.value = false;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('shows loading skeleton when isLoading is true', () => {
    mockIsLoading.value = true;
    wrapper = mount(StreamOnlyPanel);
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
  });

  it('does not show URL input when disabled', () => {
    mockEnabled.value = false;
    mockKey.value = 'somekey';
    wrapper = mount(StreamOnlyPanel);
    expect(wrapper.find('[data-testid="stream-only-url"]').exists()).toBe(false);
  });

  it('shows toggle label and description when not loading', () => {
    wrapper = mount(StreamOnlyPanel);
    expect(wrapper.text()).toContain('Enable Stream-Only Link');
    expect(wrapper.text()).toContain('OBS browser source');
  });

  it('shows URL input with correct value when enabled and key exists', () => {
    mockEnabled.value = true;
    mockKey.value = 'abc123';
    // Mock window.location.origin
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
    });
    wrapper = mount(StreamOnlyPanel);
    const urlInput = wrapper.find('[data-testid="stream-only-url"]');
    expect(urlInput.exists()).toBe(true);
    expect((urlInput.element as HTMLInputElement).value).toBe(
      'http://localhost:3000/stream-only/abc123',
    );
  });

  it('shows Copy and Regenerate buttons when enabled', () => {
    mockEnabled.value = true;
    mockKey.value = 'abc123';
    wrapper = mount(StreamOnlyPanel);
    expect(wrapper.find('[data-testid="copy-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="regenerate-button"]').exists()).toBe(true);
  });

  it('calls regenerate when Regenerate button is clicked', async () => {
    mockEnabled.value = true;
    mockKey.value = 'abc123';
    wrapper = mount(StreamOnlyPanel);
    await wrapper.find('[data-testid="regenerate-button"]').trigger('click');
    expect(mockRegenerate).toHaveBeenCalled();
  });

  it('calls toggle when Switch is clicked', async () => {
    wrapper = mount(StreamOnlyPanel);
    await wrapper.find('button[id="stream-only-switch"]').trigger('click');
    expect(mockToggle).toHaveBeenCalled();
  });

  it('does not show URL input when enabled but key is null', () => {
    mockEnabled.value = true;
    mockKey.value = null;
    wrapper = mount(StreamOnlyPanel);
    expect(wrapper.find('[data-testid="stream-only-url"]').exists()).toBe(false);
  });

  it('calls clipboard writeText when Copy button is clicked', async () => {
    mockEnabled.value = true;
    mockKey.value = 'abc123';
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
    });
    wrapper = mount(StreamOnlyPanel);
    await wrapper.find('[data-testid="copy-button"]').trigger('click');
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('stream-only/abc123'));
  });
});

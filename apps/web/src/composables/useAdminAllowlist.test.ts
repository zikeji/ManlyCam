import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useAdminAllowlist, entries as entriesRef } from './useAdminAllowlist';
import type { AllowlistEntry } from './useAdminAllowlist';
import { apiFetch } from '@/lib/api';
import { toast } from 'vue-sonner';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

// toast.success must be a vi.fn(); plain vi.fn() makes .success undefined → TypeError
vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const mockEntries: AllowlistEntry[] = [
  { id: 'e1', type: 'domain', value: 'company.com', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'e2', type: 'email', value: 'guest@gmail.com', createdAt: '2024-01-02T00:00:00.000Z' },
];

describe('useAdminAllowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entriesRef.value = [];
  });

  it('fetchEntries: loads entries and sets state', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mockEntries);
    const { entries, isLoading, fetchEntries } = useAdminAllowlist();

    const promise = fetchEntries();
    expect(isLoading.value).toBe(true);
    await promise;

    expect(entries.value).toEqual(mockEntries);
    expect(isLoading.value).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/allowlist');
  });

  it('fetchEntries: sets error message on failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));
    const { error, fetchEntries } = useAdminAllowlist();

    await fetchEntries();

    expect(error.value).toBe('Network error');
  });

  it('addEntry: appends new entry and calls toast.success', async () => {
    const newEntry = {
      id: 'e3',
      type: 'domain' as const,
      value: 'newdomain.com',
      createdAt: '2024-01-03T00:00:00.000Z',
      alreadyExists: false,
    };
    vi.mocked(apiFetch).mockResolvedValue(newEntry);
    const { entries, addEntry } = useAdminAllowlist();

    await addEntry('domain', 'newdomain.com');

    expect(entries.value).toHaveLength(1);
    expect(entries.value[0].value).toBe('newdomain.com');
    expect(toast.success).toHaveBeenCalledWith('Entry added');
  });

  it('addEntry: normalizes email to lowercase before posting', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      id: 'e4',
      type: 'email',
      value: 'guest@gmail.com',
      createdAt: '2024-01-04T00:00:00.000Z',
      alreadyExists: false,
    });
    const { addEntry } = useAdminAllowlist();

    await addEntry('email', 'Guest@Gmail.com');

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/admin/allowlist',
      expect.objectContaining({
        body: JSON.stringify({ type: 'email', value: 'guest@gmail.com' }),
      }),
    );
  });

  it('addEntry: returns result with alreadyExists: true without appending to list', async () => {
    const duplicateResponse = {
      id: 'e1',
      type: 'domain' as const,
      value: 'company.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      alreadyExists: true,
    };
    vi.mocked(apiFetch).mockResolvedValue(duplicateResponse);
    const { entries, addEntry } = useAdminAllowlist();

    const result = await addEntry('domain', 'company.com');

    expect(result.alreadyExists).toBe(true);
    expect(entries.value).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('removeEntry: removes entry from list and calls toast.success', async () => {
    entriesRef.value = [...mockEntries];
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    const { entries, removeEntry } = useAdminAllowlist();

    await removeEntry('e1');

    expect(entries.value).toHaveLength(1);
    expect(entries.value[0].id).toBe('e2');
    expect(toast.success).toHaveBeenCalledWith('Entry removed');
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/allowlist/e1', { method: 'DELETE' });
  });

  it('onMounted: fetches entries if list is empty', async () => {
    vi.mocked(apiFetch).mockResolvedValue(mockEntries);

    const TestComponent = defineComponent({
      setup() {
        useAdminAllowlist();
        return {};
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    wrapper.unmount();

    expect(apiFetch).toHaveBeenCalledWith('/api/admin/allowlist');
  });

  it('onMounted: skips fetch if entries already loaded', async () => {
    entriesRef.value = [...mockEntries];

    const TestComponent = defineComponent({
      setup() {
        useAdminAllowlist();
        return {};
      },
      template: '<div></div>',
    });

    const wrapper = mount(TestComponent);
    await wrapper.vm.$nextTick();
    wrapper.unmount();

    expect(apiFetch).not.toHaveBeenCalled();
  });
});

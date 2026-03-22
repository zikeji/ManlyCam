import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import OfflineMessageDialog from './OfflineMessageDialog.vue';

vi.mock('@/components/chat/EmojiPicker.vue', () => ({
  default: {
    name: 'EmojiPicker',
    template: '<div data-testid="emoji-picker"></div>',
    props: ['visible', 'position'],
    emits: ['select', 'close'],
  },
}));

vi.mock('@/composables/useOfflineMessage', () => ({
  useOfflineMessage: vi.fn(() => ({
    fetchOfflineMessage: vi.fn().mockResolvedValue({ emoji: null, title: null, description: null }),
    saveOfflineMessage: vi.fn().mockResolvedValue(true),
    isLoading: { value: false },
    error: { value: null },
  })),
}));

import { useOfflineMessage } from '@/composables/useOfflineMessage';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.clearAllMocks();
});

/** Mount with open=false, then set open=true so the watch fires. */
async function openDialog(overrides: Record<string, unknown> = {}): Promise<VueWrapper> {
  const w = mount(OfflineMessageDialog, {
    props: { open: false, ...overrides },
    attachTo: document.body,
  });
  await w.setProps({ open: true });
  await nextTick();
  await nextTick(); // wait for the watch fetch to settle
  wrapper = w;
  return w;
}

/** Find an element in the teleported dialog content (rendered in document.body). */
function bodyFind(selector: string): Element | null {
  return document.body.querySelector(selector);
}

describe('OfflineMessageDialog', () => {
  beforeEach(() => {
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  describe('closed state', () => {
    it('does not render dialog content when open=false', () => {
      wrapper = mount(OfflineMessageDialog, { props: { open: false }, attachTo: document.body });
      expect(bodyFind('[data-offline-dialog]')).toBeNull();
    });
  });

  describe('open state', () => {
    it('renders dialog when open=true', async () => {
      await openDialog();
      expect(bodyFind('[data-offline-dialog]')).not.toBeNull();
    });

    it('shows "Edit Offline Message" title', async () => {
      await openDialog();
      expect(document.body.textContent).toContain('Edit Offline Message');
    });

    it('calls fetchOfflineMessage on open', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ emoji: null, title: null, description: null });
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: mockFetch,
        saveOfflineMessage: vi.fn().mockResolvedValue(true),
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      await openDialog();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('shows default emoji img (1f634) when emoji is null', async () => {
      await openDialog();
      const img = bodyFind('[data-emoji-trigger] img') as HTMLImageElement | null;
      expect(img?.getAttribute('src')).toBe('/emojis/1f634.svg');
    });

    it('shows custom emoji when fetchOfflineMessage returns one', async () => {
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: '1f600', title: null, description: null }),
        saveOfflineMessage: vi.fn().mockResolvedValue(true),
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      await openDialog();
      const img = bodyFind('[data-emoji-trigger] img') as HTMLImageElement | null;
      expect(img?.getAttribute('src')).toBe('/emojis/1f600.svg');
    });

    it('populates title input with fetched value', async () => {
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: 'My Title', description: null }),
        saveOfflineMessage: vi.fn().mockResolvedValue(true),
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      await openDialog();
      const input = bodyFind('[data-title-input]') as HTMLInputElement | null;
      expect(input?.value).toBe('My Title');
    });

    it('populates description input with fetched value', async () => {
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: null, description: 'My Desc' }),
        saveOfflineMessage: vi.fn().mockResolvedValue(true),
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      await openDialog();
      const input = bodyFind('[data-description-input]') as HTMLInputElement | null;
      expect(input?.value).toBe('My Desc');
    });

    it('shows placeholder text with pet name for title', async () => {
      await openDialog();
      const input = bodyFind('[data-title-input]') as HTMLInputElement | null;
      expect(input?.getAttribute('placeholder')).toContain('Buddy needs their Zzzs');
    });
  });

  describe('Save', () => {
    it('calls saveOfflineMessage with trimmed values and closes on success', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: '1f600', title: 'Hello', description: 'World' }),
        saveOfflineMessage: mockSave,
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      const w = await openDialog();

      (bodyFind('[data-save-button]') as HTMLButtonElement | null)?.click();
      await nextTick();

      expect(mockSave).toHaveBeenCalledWith({
        emoji: '1f600',
        title: 'Hello',
        description: 'World',
      });
      expect(w.emitted('update:open')).toEqual([[false]]);
    });

    it('treats empty string title as null', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: null, description: null }),
        saveOfflineMessage: mockSave,
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      const w = await openDialog();

      (bodyFind('[data-save-button]') as HTMLButtonElement | null)?.click();
      await nextTick();

      const call = mockSave.mock.calls[0][0];
      expect(call.title).toBeNull();
      expect(call.description).toBeNull();
      expect(w.emitted('update:open')).toEqual([[false]]);
    });

    it('does not close if saveOfflineMessage returns false', async () => {
      const mockSave = vi.fn().mockResolvedValue(false);
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: null, description: null }),
        saveOfflineMessage: mockSave,
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      const w = await openDialog();

      (bodyFind('[data-save-button]') as HTMLButtonElement | null)?.click();
      await nextTick();

      expect(w.emitted('update:open')).toBeFalsy();
    });
  });

  describe('Cancel', () => {
    it('emits update:open=false without calling save', async () => {
      const mockSave = vi.fn();
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: null, description: null }),
        saveOfflineMessage: mockSave,
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      const w = await openDialog();

      (bodyFind('[data-cancel-button]') as HTMLButtonElement | null)?.click();
      expect(w.emitted('update:open')).toEqual([[false]]);
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('Reset', () => {
    it('calls saveOfflineMessage with all nulls and closes on success', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: '1f600', title: 'T', description: 'D' }),
        saveOfflineMessage: mockSave,
        isLoading: { value: false } as never,
        error: { value: null } as never,
      });
      const w = await openDialog();

      (bodyFind('[data-reset-button]') as HTMLButtonElement | null)?.click();
      await nextTick();

      expect(mockSave).toHaveBeenCalledWith({ emoji: null, title: null, description: null });
      expect(w.emitted('update:open')).toEqual([[false]]);
    });
  });

  describe('Error display', () => {
    it('displays error message when save fails', async () => {
      const errorRef = ref('Failed to save offline message');
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: null, description: null }),
        saveOfflineMessage: vi.fn().mockResolvedValue(false),
        isLoading: ref(false),
        error: errorRef,
      });
      await openDialog();

      (bodyFind('[data-save-button]') as HTMLButtonElement | null)?.click();
      await nextTick();

      const errorEl = bodyFind('[data-error-message]');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toBe('Failed to save offline message');
    });

    it('clears error when dialog is reopened', async () => {
      const errorRef = ref<string | null>(null);
      vi.mocked(useOfflineMessage).mockReturnValue({
        fetchOfflineMessage: vi
          .fn()
          .mockResolvedValue({ emoji: null, title: null, description: null }),
        saveOfflineMessage: vi.fn().mockResolvedValue(true),
        isLoading: ref(false),
        error: errorRef,
      });
      const w = await openDialog();

      await w.setProps({ open: false });
      await nextTick();
      await w.setProps({ open: true });
      await nextTick();

      const errorEl = bodyFind('[data-error-message]');
      expect(errorEl).toBeNull();
    });
  });
});

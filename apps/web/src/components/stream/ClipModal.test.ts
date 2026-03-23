import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import ClipModal from './ClipModal.vue';

const mockFetchSegmentRange = vi.fn();
const mockSubmitClip = vi.fn();
const mockIsSubmitting = ref(false);

vi.mock('@/composables/useClipCreate', () => ({
  useClipCreate: vi.fn(() => ({
    isSubmitting: mockIsSubmitting,
    fetchSegmentRange: mockFetchSegmentRange,
    submitClip: mockSubmitClip,
  })),
  handleClipStatusChanged: vi.fn(),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.clearAllMocks();
  mockIsSubmitting.value = false;
});

// 10 minutes = 600 000 ms window
const defaultRange = {
  earliest: '2026-01-01T00:00:00.000Z',
  latest: '2026-01-01T00:10:00.000Z',
};

async function openModal(range = defaultRange): Promise<VueWrapper> {
  mockFetchSegmentRange.mockResolvedValue(range);
  const w = mount(ClipModal, { props: { open: false }, attachTo: document.body });
  await w.setProps({ open: true });
  await flushPromises();
  wrapper = w;
  return w;
}

function bodyButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button'));
}

function findBodyButton(label: string): HTMLButtonElement | undefined {
  return bodyButtons().find((b) => b.textContent?.trim() === label);
}

describe('ClipModal', () => {
  beforeEach(() => {
    mockSubmitClip.mockResolvedValue({ id: 'clip-001', status: 'processing' });
  });

  describe('closed state', () => {
    it('does not render dialog content when open=false', () => {
      wrapper = mount(ClipModal, { props: { open: false }, attachTo: document.body });
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe('open state — loading', () => {
    it('calls fetchSegmentRange when dialog opens', async () => {
      await openModal();
      expect(mockFetchSegmentRange).toHaveBeenCalledOnce();
    });

    it('shows loading placeholder while range is being fetched', async () => {
      let resolve!: (v: unknown) => void;
      mockFetchSegmentRange.mockReturnValue(new Promise((r) => (resolve = r)));
      const w = mount(ClipModal, { props: { open: false }, attachTo: document.body });
      await w.setProps({ open: true });
      await nextTick();
      wrapper = w;
      expect(document.body.textContent).toContain('Loading stream range');
      resolve(defaultRange);
    });

    it('renders preset buttons after range loads', async () => {
      await openModal();
      expect(findBodyButton('30s')).toBeDefined();
      expect(findBodyButton('1 min')).toBeDefined();
      expect(findBodyButton('2 min')).toBeDefined();
    });

    it('resets state and re-fetches when dialog is reopened', async () => {
      const w = await openModal();
      await w.setProps({ open: false });
      await nextTick();
      await w.setProps({ open: true });
      await flushPromises();
      expect(mockFetchSegmentRange).toHaveBeenCalledTimes(2);
    });
  });

  describe('range error', () => {
    it('shows error message when fetchSegmentRange rejects with Error', async () => {
      mockFetchSegmentRange.mockRejectedValue(new Error('Stream not ready'));
      const w = mount(ClipModal, { props: { open: false }, attachTo: document.body });
      await w.setProps({ open: true });
      await flushPromises();
      wrapper = w;
      expect(document.body.textContent).toContain('Stream not ready');
    });

    it('shows fallback message when fetchSegmentRange rejects with non-Error', async () => {
      mockFetchSegmentRange.mockRejectedValue('unknown failure');
      const w = mount(ClipModal, { props: { open: false }, attachTo: document.body });
      await w.setProps({ open: true });
      await flushPromises();
      wrapper = w;
      expect(document.body.textContent).toContain('Could not load stream range');
    });

    it('clears error and re-fetches on reopen', async () => {
      mockFetchSegmentRange.mockRejectedValueOnce(new Error('offline'));
      mockFetchSegmentRange.mockResolvedValueOnce(defaultRange);
      const w = mount(ClipModal, { props: { open: false }, attachTo: document.body });
      await w.setProps({ open: true });
      await flushPromises();
      wrapper = w;
      expect(document.body.textContent).toContain('offline');

      await w.setProps({ open: false });
      await nextTick();
      await w.setProps({ open: true });
      await flushPromises();
      expect(document.body.textContent).not.toContain('offline');
    });
  });

  describe('preset buttons', () => {
    it('30s preset produces a 30s duration label', async () => {
      await openModal();
      findBodyButton('30s')?.click();
      await nextTick();
      expect(document.body.textContent).toContain('30s');
    });

    it('1 min preset produces a 1m duration label', async () => {
      await openModal();
      findBodyButton('1 min')?.click();
      await nextTick();
      // formatDuration(60000): m=1, rem=0 → '1m'
      expect(document.body.textContent).toContain('1m');
    });

    it('2 min preset produces a 2m duration label', async () => {
      await openModal();
      findBodyButton('2 min')?.click();
      await nextTick();
      expect(document.body.textContent).toContain('2m');
    });
  });

  describe('range sliders', () => {
    it('adjusting start slider updates duration display', async () => {
      await openModal();
      // Window = 600 000ms; move start to 510 000ms → 90s duration → '1m 30s'
      const sliders = document.body.querySelectorAll('input[type="range"]');
      const startSlider = sliders[0] as HTMLInputElement;
      startSlider.value = '510000';
      startSlider.dispatchEvent(new Event('input'));
      await nextTick();
      // formatDuration(90000): m=1, rem=30 → '1m 30s'
      expect(document.body.textContent).toContain('1m 30s');
    });

    it('adjusting end slider updates duration display', async () => {
      await openModal();
      // Default: start = 570000, end = 600000 (30s). Move end to 585000 → 15s duration → '15s'
      const sliders = document.body.querySelectorAll('input[type="range"]');
      const endSlider = sliders[1] as HTMLInputElement;
      endSlider.value = '585000';
      endSlider.dispatchEvent(new Event('input'));
      await nextTick();
      expect(document.body.textContent).toContain('15s');
    });
  });

  describe('form validation', () => {
    it('Create Clip button is disabled when name is empty', async () => {
      await openModal();
      const submitBtn = findBodyButton('Create Clip');
      expect(submitBtn?.disabled).toBe(true);
    });

    it('Create Clip button is enabled when name is filled and duration is valid', async () => {
      await openModal();
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = 'My Clip';
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();
      const submitBtn = findBodyButton('Create Clip');
      expect(submitBtn?.disabled).toBe(false);
    });

    it('shows name error when name exceeds 200 characters', async () => {
      await openModal();
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = 'a'.repeat(201);
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();
      expect(document.body.textContent).toContain('Name must be 200 characters or less');
    });

    it('shows description error when description exceeds 500 characters', async () => {
      await openModal();
      const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'b'.repeat(501);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
      expect(document.body.textContent).toContain('Description must be 500 characters or less');
    });

    it('submit is disabled when duration exceeds 2 minutes', async () => {
      // 5-minute window so we can exceed 120s
      const wideRange = {
        earliest: '2026-01-01T00:00:00.000Z',
        latest: '2026-01-01T00:05:00.000Z',
      };
      await openModal(wideRange);

      // Move start to 0 → full 300s duration
      const sliders = document.body.querySelectorAll('input[type="range"]');
      const startSlider = sliders[0] as HTMLInputElement;
      startSlider.value = '0';
      startSlider.dispatchEvent(new Event('input'));
      await nextTick();

      // Give a valid name so the only blocking factor is duration
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = 'Long Clip';
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();

      const submitBtn = findBodyButton('Create Clip');
      expect(submitBtn?.disabled).toBe(true);
    });
  });

  describe('form submission', () => {
    async function fillAndSubmit(name = 'Test Clip') {
      await openModal();
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = name;
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();
      findBodyButton('Create Clip')?.click();
      await flushPromises();
    }

    it('calls submitClip with trimmed name and shareToChat=false by default', async () => {
      await fillAndSubmit('  Test Clip  ');
      expect(mockSubmitClip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Clip', shareToChat: false }),
      );
    });

    it('calls submitClip with startTime and endTime derived from segment range', async () => {
      await fillAndSubmit();
      expect(mockSubmitClip).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.stringContaining('2026'),
          endTime: expect.stringContaining('2026'),
        }),
      );
    });

    it('emits update:open=false on successful submit', async () => {
      const w = await openModal();
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = 'Test Clip';
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();
      findBodyButton('Create Clip')?.click();
      await flushPromises();
      expect(w.emitted('update:open')).toEqual([[false]]);
    });

    it('shows submitError and does not close on failed submit (Error)', async () => {
      mockSubmitClip.mockRejectedValue(new Error('Failed to create clip'));
      const w = await openModal();
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = 'Bad Clip';
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();
      findBodyButton('Create Clip')?.click();
      await flushPromises();
      expect(document.body.textContent).toContain('Failed to create clip');
      expect(w.emitted('update:open')).toBeFalsy();
    });

    it('shows fallback submitError when submitClip rejects with non-Error', async () => {
      mockSubmitClip.mockRejectedValue('unexpected');
      await openModal();
      const nameInput = document.body.querySelector('#clip-name') as HTMLInputElement;
      nameInput.value = 'Bad Clip';
      nameInput.dispatchEvent(new Event('input'));
      await nextTick();
      findBodyButton('Create Clip')?.click();
      await flushPromises();
      expect(document.body.textContent).toContain('Failed to create clip');
    });

    it('does nothing when handleSubmit is called with canSubmit=false', async () => {
      await openModal();
      // Name is empty → canSubmit is false
      findBodyButton('Create Clip')?.click();
      await nextTick();
      expect(mockSubmitClip).not.toHaveBeenCalled();
    });

    it('shows "Creating…" label while isSubmitting is true', async () => {
      await openModal();
      mockIsSubmitting.value = true;
      await nextTick();
      // When submitting, button label changes
      const creatingBtn = bodyButtons().find((b) => b.textContent?.includes('Creating'));
      expect(creatingBtn).toBeDefined();
    });
  });

  describe('Cancel', () => {
    it('emits update:open=false without calling submitClip', async () => {
      const w = await openModal();
      findBodyButton('Cancel')?.click();
      await nextTick();
      expect(w.emitted('update:open')).toEqual([[false]]);
      expect(mockSubmitClip).not.toHaveBeenCalled();
    });
  });
});

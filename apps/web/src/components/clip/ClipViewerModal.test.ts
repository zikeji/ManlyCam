import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ClipViewerModal from './ClipViewerModal.vue';

// Use vi.hoisted so these are available when vi.mock factories run.
// __v_isRef: true makes Vue treat these as refs so watch(activeClipId, ...) works correctly.
const mockActiveClipId = vi.hoisted(() => ({
  __v_isRef: true as const,
  value: 'clip-001' as string | null,
}));
const mockIsClipModalOpen = vi.hoisted(() => ({
  __v_isRef: true as const,
  value: true,
}));
const mockCloseClip = vi.hoisted(() => vi.fn());
const mockApiFetch = vi.hoisted(() => vi.fn());

vi.mock('@/composables/useClipModal', () => ({
  closeClip: mockCloseClip,
  activeClipId: mockActiveClipId,
  isClipModalOpen: mockIsClipModalOpen,
  openClip: vi.fn(),
  useClipModal: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: mockApiFetch,
}));

const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

const clipDetailFixture = {
  id: 'clip-001',
  name: 'Dog runs around',
  description: 'Cute moment',
  durationSeconds: 95,
  clipperName: 'Alice',
  clipperAvatarUrl: null,
  showClipper: true,
};

describe('ClipViewerModal.vue', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveClipId.value = 'clip-001';
    mockApiFetch.mockResolvedValue(clipDetailFixture);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders the modal overlay', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    expect(wrapper.find('[data-clip-viewer-modal]').exists()).toBe(true);
  });

  it('fetches clip data on mount for activeClipId', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/clips/clip-001');
  });

  it('renders clip name after fetching', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-modal-clip-name]').text()).toBe('Dog runs around');
  });

  it('renders video element with download src', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    const video = wrapper.find('[data-modal-video]');
    expect(video.exists()).toBe(true);
    expect(video.attributes('src')).toBe('/api/clips/clip-001/download');
  });

  it('does not render duration in metadata', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-modal-duration]').exists()).toBe(false);
  });

  it('renders clipper name when showClipper is true', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-modal-clipper]').text()).toContain('Alice');
  });

  it('renders description as markdown when present', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    const desc = wrapper.find('[data-modal-description]');
    expect(desc.exists()).toBe(true);
    expect(desc.html()).toContain('Cute moment');
  });

  it('renders bold markdown in description', async () => {
    mockApiFetch.mockResolvedValue({ ...clipDetailFixture, description: '**bold text**' });
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    const desc = wrapper.find('[data-modal-description]');
    expect(desc.html()).toContain('<strong>bold text</strong>');
  });

  it('renders X close button', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    expect(wrapper.find('[data-modal-close-button]').exists()).toBe(true);
  });

  it('calls closeClip when X button is clicked', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await wrapper.find('[data-modal-close-button]').trigger('click');
    expect(mockCloseClip).toHaveBeenCalled();
  });

  it('calls closeClip when Escape key is pressed', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mockCloseClip).toHaveBeenCalled();
  });

  it('does not call closeClip for non-Escape keys', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mockCloseClip).not.toHaveBeenCalled();
  });

  it('renders Download button', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    expect(wrapper.find('[data-modal-download-button]').exists()).toBe(true);
  });

  it('opens download URL in new tab when Download is clicked', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await wrapper.find('[data-modal-download-button]').trigger('click');
    expect(mockWindowOpen).toHaveBeenCalledWith('/api/clips/clip-001/download', '_blank');
  });

  it('calls closeClip when clicking the overlay backdrop', async () => {
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await wrapper.find('[data-clip-viewer-modal]').trigger('click');
    expect(mockCloseClip).toHaveBeenCalled();
  });

  it('shows error state when fetch fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-modal-error]').exists()).toBe(true);
    expect(wrapper.find('[data-modal-error]').text()).toContain('Network error');
  });

  it('removes keydown listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    wrapper = mount(ClipViewerModal);
    await nextTick();
    wrapper.unmount();
    wrapper = null;
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('does not render description when null', async () => {
    mockApiFetch.mockResolvedValue({ ...clipDetailFixture, description: null });
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-modal-description]').exists()).toBe(false);
  });

  it('does not render clipper when showClipper is false', async () => {
    mockApiFetch.mockResolvedValue({ ...clipDetailFixture, showClipper: false });
    wrapper = mount(ClipViewerModal);
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-modal-clipper]').exists()).toBe(false);
  });
});

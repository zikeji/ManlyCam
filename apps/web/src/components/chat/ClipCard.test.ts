import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ClipCard from './ClipCard.vue';
import type { ClipChatMessage } from '@manlycam/types';

// Mock useClipModal to capture openClip calls
const mockOpenClip = vi.hoisted(() => vi.fn());
vi.mock('@/composables/useClipModal', () => ({
  openClip: mockOpenClip,
  closeClip: vi.fn(),
  isClipModalOpen: { value: false },
  activeClipId: { value: null },
  useClipModal: vi.fn(),
}));

const baseClipMessage: ClipChatMessage = {
  id: 'msg-clip-001',
  userId: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  authorRole: 'ViewerCompany',
  messageType: 'clip',
  content: 'Shared a clip',
  editHistory: null,
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-03-24T10:00:00.000Z',
  userTag: null,
  clipId: 'clip-001',
  clipName: 'Dog runs around',
  clipDurationSeconds: 95,
  clipThumbnailUrl: '/api/clips/clip-001/thumbnail',
};

describe('ClipCard.vue', () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.clearAllMocks();
  });

  describe('live clip card', () => {
    it('renders clip name', () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      expect(wrapper.find('[data-clip-name]').text()).toBe('Dog runs around');
    });

    it('renders thumbnail when clipThumbnailUrl is set', () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      const img = wrapper.find('[data-thumbnail]');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe('/api/clips/clip-001/thumbnail');
      expect(img.attributes('alt')).toBe('Dog runs around');
    });

    it('renders duration badge formatted as M:SS', () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      const badge = wrapper.find('[data-duration-badge]');
      expect(badge.exists()).toBe(true);
      expect(badge.text()).toBe('1:35');
    });

    it('renders duration badge padded correctly for seconds < 10', () => {
      wrapper = mount(ClipCard, {
        props: { message: { ...baseClipMessage, clipDurationSeconds: 63 } },
      });
      expect(wrapper.find('[data-duration-badge]').text()).toBe('1:03');
    });

    it('omits duration badge when clipDurationSeconds is null', () => {
      wrapper = mount(ClipCard, {
        props: { message: { ...baseClipMessage, clipDurationSeconds: null } },
      });
      expect(wrapper.find('[data-duration-badge]').exists()).toBe(false);
    });

    it('omits thumbnail when clipThumbnailUrl is undefined', () => {
      const { clipThumbnailUrl: _url, ...noThumb } = baseClipMessage;
      wrapper = mount(ClipCard, { props: { message: noThumb as ClipChatMessage } });
      expect(wrapper.find('[data-thumbnail]').exists()).toBe(false);
    });

    it('renders Watch button', () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      expect(wrapper.find('[data-watch-button]').exists()).toBe(true);
    });

    it('does not render Download button', () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      expect(wrapper.find('[data-download-button]').exists()).toBe(false);
    });

    it('calls openClip with clipId when Watch is clicked', async () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      await wrapper.find('[data-watch-button]').trigger('click');
      expect(mockOpenClip).toHaveBeenCalledWith('clip-001');
    });

    it('calls openClip with clipId when thumbnail area is clicked', async () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      await wrapper.find('[data-thumbnail-area]').trigger('click');
      expect(mockOpenClip).toHaveBeenCalledWith('clip-001');
    });

    it('does not render tombstone when tombstone is not set', () => {
      wrapper = mount(ClipCard, { props: { message: baseClipMessage } });
      expect(wrapper.find('[data-tombstone]').exists()).toBe(false);
    });
  });

  describe('tombstone state', () => {
    const tombstoneMessage: ClipChatMessage = { ...baseClipMessage, tombstone: true };

    it('renders tombstone text when tombstone is true', () => {
      wrapper = mount(ClipCard, { props: { message: tombstoneMessage } });
      expect(wrapper.find('[data-tombstone]').exists()).toBe(true);
      expect(wrapper.find('[data-tombstone]').text()).toContain('This clip is no longer available');
    });

    it('does not render thumbnail in tombstone state', () => {
      wrapper = mount(ClipCard, { props: { message: tombstoneMessage } });
      expect(wrapper.find('[data-thumbnail]').exists()).toBe(false);
    });

    it('does not render Watch button in tombstone state', () => {
      wrapper = mount(ClipCard, { props: { message: tombstoneMessage } });
      expect(wrapper.find('[data-watch-button]').exists()).toBe(false);
    });

    it('renders the outer card container (identical dimensions) in tombstone state', () => {
      wrapper = mount(ClipCard, { props: { message: tombstoneMessage } });
      expect(wrapper.find('[data-clip-card]').exists()).toBe(true);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useClips, clips, handleClipStatusUpdate, handleClipVisibilityChanged } from './useClips';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { apiFetch } = await import('@/lib/api');
const { toast } = await import('vue-sonner');

const baseClip = {
  id: 'clip-001',
  userId: 'user-001',
  name: 'My Clip',
  description: null,
  status: 'ready',
  visibility: 'private',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  durationSeconds: 30,
  showClipper: false,
  showClipperAvatar: false,
  clipperName: null,
  clipperAvatarUrl: null,
  createdAt: '2026-03-22T10:00:00.000Z',
  updatedAt: null,
  lastEditedAt: null,
  clipperDisplayName: 'Test User',
  clipperAvatarUrlOwner: null,
  clipperRole: 'ViewerGuest',
};

describe('handleClipStatusUpdate', () => {
  beforeEach(() => {
    clips.value = [{ ...baseClip, status: 'pending', durationSeconds: null }];
  });

  it('updates status when clip found', () => {
    handleClipStatusUpdate({ clipId: 'clip-001', status: 'failed' });
    expect(clips.value[0].status).toBe('failed');
  });

  it('updates status and durationSeconds when status becomes ready', () => {
    handleClipStatusUpdate({
      clipId: 'clip-001',
      status: 'ready',
      durationSeconds: 42,
      thumbnailKey: null,
    });
    expect(clips.value[0].status).toBe('ready');
    expect(clips.value[0].durationSeconds).toBe(42);
  });

  it('does nothing when clip not in list', () => {
    handleClipStatusUpdate({ clipId: 'clip-999', status: 'failed' });
    expect(clips.value[0].status).toBe('pending');
  });
});

describe('handleClipVisibilityChanged', () => {
  beforeEach(() => {
    clips.value = [{ ...baseClip }];
  });

  it('removes clip when visibility is deleted', () => {
    handleClipVisibilityChanged({ clipId: 'clip-001', visibility: 'deleted' });
    expect(clips.value).toHaveLength(0);
  });

  it('updates visibility when clip found', () => {
    handleClipVisibilityChanged({ clipId: 'clip-001', visibility: 'shared' });
    expect(clips.value[0].visibility).toBe('shared');
  });

  it('does nothing for unknown clipId when not deleted', () => {
    handleClipVisibilityChanged({ clipId: 'clip-999', visibility: 'shared' });
    expect(clips.value[0].visibility).toBe('private');
  });

  it('does nothing for unknown clipId on deleted', () => {
    handleClipVisibilityChanged({ clipId: 'clip-999', visibility: 'deleted' });
    expect(clips.value).toHaveLength(1);
  });
});

describe('useClips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clips.value = [];
  });

  describe('fetchClips', () => {
    it('fetches clips and sets state on page 0', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ clips: [baseClip], total: 1 });
      const { fetchClips, clips: clipsRef, total, isLoading } = useClips();
      const promise = fetchClips({ page: 0 });
      expect(isLoading.value).toBe(true);
      await promise;
      expect(clipsRef.value).toEqual([baseClip]);
      expect(total.value).toBe(1);
      expect(isLoading.value).toBe(false);
    });

    it('appends clips on page > 0', async () => {
      clips.value = [baseClip];
      const clip2 = { ...baseClip, id: 'clip-002' };
      vi.mocked(apiFetch).mockResolvedValue({ clips: [clip2], total: 2 });
      const { fetchClips } = useClips();
      await fetchClips({ page: 1 });
      expect(clips.value).toHaveLength(2);
    });

    it('includes includeShared in query when true', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ clips: [], total: 0 });
      const { fetchClips } = useClips();
      await fetchClips({ page: 0, includeShared: true });
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('includeShared=true');
    });

    it('includes all in query when true', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ clips: [], total: 0 });
      const { fetchClips } = useClips();
      await fetchClips({ page: 0, all: true });
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('all=true');
    });

    it('sets error on failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));
      const { fetchClips, error } = useClips();
      await fetchClips();
      expect(error.value).toBe('Network error');
    });

    it('uses default page 0 when no params passed', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ clips: [], total: 0 });
      const { fetchClips } = useClips();
      await fetchClips();
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toContain('page=0');
    });
  });

  describe('deleteClip', () => {
    it('calls DELETE and removes clip from list', async () => {
      clips.value = [{ ...baseClip }];
      vi.mocked(apiFetch).mockResolvedValue(undefined);
      const { deleteClip } = useClips();
      await deleteClip('clip-001');
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/clips/clip-001', { method: 'DELETE' });
      expect(clips.value).toHaveLength(0);
    });
  });

  describe('updateClip', () => {
    it('calls PATCH and updates clip in list', async () => {
      clips.value = [{ ...baseClip }];
      const updated = { ...baseClip, name: 'New Name' };
      vi.mocked(apiFetch).mockResolvedValue(updated);
      const { updateClip } = useClips();
      await updateClip('clip-001', { name: 'New Name' });
      expect(clips.value[0].name).toBe('New Name');
    });

    it('does not fail if clip not in list', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ ...baseClip, id: 'clip-999' });
      const { updateClip } = useClips();
      await expect(updateClip('clip-999', { name: 'X' })).resolves.toBeUndefined();
    });
  });

  describe('shareClipToChat', () => {
    it('calls POST share and shows success toast', async () => {
      vi.mocked(apiFetch).mockResolvedValue(undefined);
      const { shareClipToChat } = useClips();
      await shareClipToChat('clip-001');
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/clips/clip-001/share', {
        method: 'POST',
      });
      expect(vi.mocked(toast.success)).toHaveBeenCalled();
    });
  });

  describe('copyClipLink', () => {
    it('writes to clipboard and shows info toast when private', async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
      const { copyClipLink } = useClips();
      await copyClipLink('clip-001', 'private');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/clips/clip-001'),
      );
      expect(vi.mocked(toast.info)).toHaveBeenCalled();
    });

    it('shows success toast when not private', async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
      const { copyClipLink } = useClips();
      await copyClipLink('clip-001', 'shared');
      expect(vi.mocked(toast.success)).toHaveBeenCalled();
    });
  });

  describe('downloadClip', () => {
    it('sets window.location.href to download URL', () => {
      const location = { href: '' };
      vi.stubGlobal('location', location);
      const { downloadClip } = useClips();
      downloadClip('clip-001');
      expect(location.href).toContain('/api/clips/clip-001/download');
      vi.unstubAllGlobals();
    });
  });

  describe('getClipStreamUrl', () => {
    it('returns the url from the stream endpoint', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ url: 'https://presigned.example.com/stream' });
      const { getClipStreamUrl } = useClips();
      const url = await getClipStreamUrl('clip-001');
      expect(url).toBe('https://presigned.example.com/stream');
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/clips/clip-001/stream');
    });
  });
});

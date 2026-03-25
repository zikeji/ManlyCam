import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { VueWrapper } from '@vue/test-utils';
import ClipPage from './ClipPage.vue';

// --- Auth mock (hoisted so vi.mock factory can reference them) ---
const { mockUser, mockAuthLoading, mockFetchCurrentUser } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vueModule = require('vue') as typeof import('vue');
  return {
    mockUser: vueModule.ref<{ id: string; displayName: string } | null>(null),
    mockAuthLoading: vueModule.ref(false),
    mockFetchCurrentUser: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/composables/useAuth', () => ({
  user: mockUser,
  authLoading: mockAuthLoading,
  fetchCurrentUser: mockFetchCurrentUser,
  useAuth: () => ({
    user: mockUser,
    authLoading: mockAuthLoading,
    fetchCurrentUser: mockFetchCurrentUser,
  }),
}));

// --- Stream mock (hoisted) ---
const { mockStreamState, mockInitStream } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vueModule = require('vue') as typeof import('vue');
  return {
    mockStreamState: vueModule.ref<string>('connecting'),
    mockInitStream: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: mockStreamState,
    initStream: mockInitStream,
  }),
}));

// --- API mock (hoisted so mock factory and test code share the same class) ---
const { mockApiFetch, MockApiFetchError } = vi.hoisted(() => {
  class ApiFetchError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code = 'UNKNOWN') {
      super(message);
      this.name = 'ApiFetchError';
      this.status = status;
      this.code = code;
    }
  }
  return { mockApiFetch: vi.fn(), MockApiFetchError: ApiFetchError };
});

vi.mock('@/lib/api', () => ({
  apiFetch: mockApiFetch,
  ApiFetchError: MockApiFetchError,
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/clips/:id', component: ClipPage }],
    scrollBehavior: undefined,
  });
}

const baseClip = {
  id: 'clip-001',
  userId: 'user-001',
  name: 'Test Clip',
  description: 'A test description',
  visibility: 'public',
  thumbnailKey: 'thumb.jpg',
  thumbnailUrl: '/api/clips/clip-001/thumbnail',
  durationSeconds: 30,
  showClipper: false,
  showClipperAvatar: false,
  clipperName: null,
  clipperAvatarUrl: null,
};

describe('ClipPage.vue', () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.value = null;
    mockAuthLoading.value = false;
    mockStreamState.value = 'connecting';
    // Reset history state
    Object.defineProperty(window, 'history', {
      value: { state: {} },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  async function mountAtClip(clipId = 'clip-001') {
    const router = makeRouter();
    await router.push(`/clips/${clipId}`);
    wrapper = mount(ClipPage, {
      global: { plugins: [router] },
    });
    await flushPromises();
    return wrapper;
  }

  // --- Loading state ---

  it('shows loading spinner initially', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    const router = makeRouter();
    await router.push('/clips/clip-001');
    wrapper = mount(ClipPage, { global: { plugins: [router] } });
    expect(wrapper.find('[data-testid="clip-loading"]').exists()).toBe(true);
  });

  // --- Unauthenticated public clip ---

  it('renders video player, name, description for unauthenticated public clip', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();

    expect(wrapper!.find('[data-testid="clip-page"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="clip-video"]').attributes('src')).toBe(
      '/api/clips/clip-001/download',
    );
    expect(wrapper!.find('[data-testid="clip-name"]').text()).toBe('Test Clip');
    expect(wrapper!.find('[data-testid="clip-description"]').text()).toBe('A test description');
  });

  it('hides description when clip has no description', async () => {
    mockApiFetch.mockResolvedValue({ ...baseClip, description: null });
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-description"]').exists()).toBe(false);
  });

  it('shows download button with correct href for unauthenticated user', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    const download = wrapper!.find('[data-testid="clip-download"]');
    expect(download.exists()).toBe(true);
    expect(download.attributes('href')).toBe('/api/clips/clip-001/download');
  });

  it('does not show stream CTA for unauthenticated user', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-stream-cta"]').exists()).toBe(false);
  });

  // --- Unauthenticated shared clip (401) ---

  it('renders sign-in prompt for 401 response', async () => {
    mockApiFetch.mockRejectedValue(new MockApiFetchError('Unauthorized', 401, 'UNAUTHORIZED'));
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-unauthorized"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('Sign in to view this clip');
    expect(wrapper!.find('a[href="/api/auth/google"]').exists()).toBe(true);
  });

  // --- Missing or private clip (404) ---

  it('renders not-found state for 404 response', async () => {
    mockApiFetch.mockRejectedValue(new MockApiFetchError('Not found', 404, 'NOT_FOUND'));
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-not-found"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('Clip not found');
  });

  it('renders not-found state for non-ApiFetchError', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-not-found"]').exists()).toBe(true);
  });

  // --- Authenticated user with stream CTA ---

  it('shows stream CTA "Watch Live" when authenticated and stream is live', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    mockUser.value = { id: 'user-001', displayName: 'Test User' };
    mockStreamState.value = 'live';
    await mountAtClip();

    const cta = wrapper!.find('[data-testid="clip-stream-cta"]');
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toBe('Watch Live');
    expect(cta.attributes('href')).toBe('/');
  });

  it('shows stream CTA "Go to Stream" when authenticated and stream is not live', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    mockUser.value = { id: 'user-001', displayName: 'Test User' };
    mockStreamState.value = 'explicit-offline';
    await mountAtClip();

    const cta = wrapper!.find('[data-testid="clip-stream-cta"]');
    expect(cta.exists()).toBe(true);
    expect(cta.text()).toBe('Go to Stream');
  });

  it('shows stream CTA "Go to Stream" when stream state is connecting', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    mockUser.value = { id: 'user-001', displayName: 'Test User' };
    mockStreamState.value = 'connecting';
    await mountAtClip();

    const cta = wrapper!.find('[data-testid="clip-stream-cta"]');
    expect(cta.text()).toBe('Go to Stream');
  });

  it('calls initStream for authenticated users', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    mockUser.value = { id: 'user-001', displayName: 'Test User' };
    await mountAtClip();
    expect(mockInitStream).toHaveBeenCalledOnce();
  });

  it('does not call initStream for unauthenticated users', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    mockUser.value = null;
    await mountAtClip();
    expect(mockInitStream).not.toHaveBeenCalled();
  });

  it('shows download button for authenticated user', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    mockUser.value = { id: 'user-001', displayName: 'Test User' };
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-download"]').exists()).toBe(true);
  });

  // --- Clipper attribution ---

  it('hides attribution block when showClipper is false', async () => {
    mockApiFetch.mockResolvedValue({ ...baseClip, showClipper: false });
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-attribution"]').exists()).toBe(false);
  });

  it('shows clipper name when showClipper is true', async () => {
    mockApiFetch.mockResolvedValue({
      ...baseClip,
      showClipper: true,
      clipperName: 'CoolClipper',
      showClipperAvatar: false,
      clipperAvatarUrl: null,
    });
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-attribution"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="clip-clipper-name"]').text()).toBe('CoolClipper');
    expect(wrapper!.find('[data-testid="clip-clipper-avatar"]').exists()).toBe(false);
  });

  it('shows clipper avatar when showClipperAvatar is true and avatarUrl is present', async () => {
    mockApiFetch.mockResolvedValue({
      ...baseClip,
      showClipper: true,
      clipperName: 'CoolClipper',
      showClipperAvatar: true,
      clipperAvatarUrl: 'https://example.com/avatar.jpg',
    });
    await mountAtClip();
    const avatar = wrapper!.find('[data-testid="clip-clipper-avatar"]');
    expect(avatar.exists()).toBe(true);
    expect(avatar.attributes('src')).toBe('https://example.com/avatar.jpg');
  });

  it('uses fallback alt text when clipperName is null and avatar is shown', async () => {
    mockApiFetch.mockResolvedValue({
      ...baseClip,
      showClipper: true,
      clipperName: null,
      showClipperAvatar: true,
      clipperAvatarUrl: 'https://example.com/avatar.jpg',
    });
    await mountAtClip();
    const avatar = wrapper!.find('[data-testid="clip-clipper-avatar"]');
    expect(avatar.exists()).toBe(true);
    expect(avatar.attributes('alt')).toBe('Clipper avatar');
  });

  it('hides clipper avatar when showClipperAvatar is true but avatarUrl is null', async () => {
    mockApiFetch.mockResolvedValue({
      ...baseClip,
      showClipper: true,
      clipperName: 'CoolClipper',
      showClipperAvatar: true,
      clipperAvatarUrl: null,
    });
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-clipper-avatar"]').exists()).toBe(false);
  });

  // --- Modal detection ---

  it('renders empty div (modal mode) when history.state has clipModal+fromRoute', async () => {
    Object.defineProperty(window, 'history', {
      value: { state: { clipModal: true, fromRoute: '/' } },
      writable: true,
      configurable: true,
    });
    const router = makeRouter();
    await router.push('/clips/clip-001');
    wrapper = mount(ClipPage, { global: { plugins: [router] } });
    await flushPromises();

    // Should not show any clip content
    expect(wrapper.find('[data-testid="clip-page"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="clip-loading"]').exists()).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('renders standalone page when clipModal is true but fromRoute is not /', async () => {
    Object.defineProperty(window, 'history', {
      value: { state: { clipModal: true, fromRoute: '/other' } },
      writable: true,
      configurable: true,
    });
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-page"]').exists()).toBe(true);
  });

  it('renders standalone page when fromRoute is / but clipModal is false', async () => {
    Object.defineProperty(window, 'history', {
      value: { state: { clipModal: false, fromRoute: '/' } },
      writable: true,
      configurable: true,
    });
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    expect(wrapper!.find('[data-testid="clip-page"]').exists()).toBe(true);
  });

  it('calls fetchCurrentUser on mount', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    expect(mockFetchCurrentUser).toHaveBeenCalledOnce();
  });

  it('continues to fetch clip even when fetchCurrentUser throws', async () => {
    mockFetchCurrentUser.mockRejectedValueOnce(new Error('Auth network error'));
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    expect(mockFetchCurrentUser).toHaveBeenCalledOnce();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/clips/clip-001');
    expect(wrapper!.find('[data-testid="clip-page"]').exists()).toBe(true);
  });

  it('shows video error state when video fails to load', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    const video = wrapper!.find('[data-testid="clip-video"]');
    expect(video.exists()).toBe(true);
    await video.trigger('error');
    expect(wrapper!.find('[data-testid="clip-video-error"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="clip-video"]').exists()).toBe(false);
  });

  it('video error state shows download fallback link', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip();
    await wrapper!.find('[data-testid="clip-video"]').trigger('error');
    const errorState = wrapper!.find('[data-testid="clip-video-error"]');
    expect(errorState.text()).toContain('Video failed to load');
    const downloadLink = errorState.find('a');
    expect(downloadLink.attributes('href')).toBe('/api/clips/clip-001/download');
  });

  it('calls apiFetch with correct clip URL', async () => {
    mockApiFetch.mockResolvedValue(baseClip);
    await mountAtClip('clip-abc');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/clips/clip-abc');
  });
});

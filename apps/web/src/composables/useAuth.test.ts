import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp as createVueApp } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { Router } from 'vue-router';
import type { MeResponse } from '@manlycam/types';

const mockInvalidateRouterCache = vi.hoisted(() => vi.fn());
vi.mock('@/router', () => ({
  invalidateRouterCache: mockInvalidateRouterCache,
}));

// Provide a minimal Vue app context (router is required by useAuth)
function withRouter<T>(fn: () => T): T {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  const app = createVueApp({ template: '<div/>' });
  app.use(router);
  let result!: T;
  app.runWithContext(() => {
    result = fn();
  });
  return result;
}

function withRouterFull<T>(fn: () => T): { result: T; router: Router } {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  const app = createVueApp({ template: '<div/>' });
  app.use(router);
  let result!: T;
  app.runWithContext(() => {
    result = fn();
  });
  return { result, router };
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('user is null initially', async () => {
    const { useAuth } = await import('./useAuth');
    const { user } = withRouter(() => useAuth());
    expect(user.value).toBeNull();
  });

  it('authLoading is true initially', async () => {
    const { useAuth } = await import('./useAuth');
    const { authLoading } = withRouter(() => useAuth());
    expect(authLoading.value).toBe(true);
  });

  it('fetchCurrentUser sets user on success', async () => {
    const mockUser = {
      id: 'u1',
      displayName: 'Alice',
      email: 'alice@example.com',
      role: 'ViewerCompany',
      avatarUrl: null,
      bannedAt: null,
      mutedAt: null,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUser),
    } as Response);

    const { useAuth } = await import('./useAuth');
    const { user, authLoading, fetchCurrentUser } = withRouter(() => useAuth());
    await fetchCurrentUser();
    expect(user.value).toEqual(mockUser);
    expect(authLoading.value).toBe(false);
  });

  it('fetchCurrentUser sets user to null on 401 UNAUTHORIZED error', async () => {
    const { ApiFetchError } = await import('@/lib/api');
    const unauthorizedError = new ApiFetchError('Request failed (401)', 401, 'UNAUTHORIZED');

    global.fetch = vi.fn().mockRejectedValue(unauthorizedError);

    const { useAuth } = await import('./useAuth');
    const { user, authLoading, fetchCurrentUser } = withRouter(() => useAuth());
    await fetchCurrentUser();
    expect(user.value).toBeNull();
    expect(authLoading.value).toBe(false);
  });

  it('fetchCurrentUser keeps user null on network error (non-auth)', async () => {
    const networkError = new Error('Network error');
    // Note: networkError is not ApiFetchError, so it's treated as a network error

    global.fetch = vi.fn().mockRejectedValue(networkError);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { useAuth } = await import('./useAuth');
    const { user, authLoading, fetchCurrentUser } = withRouter(() => useAuth());
    await fetchCurrentUser();
    expect(user.value).toBeNull();
    expect(authLoading.value).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch user:', networkError);
  });

  it('fetchCurrentUser returns early if authLoading is false', async () => {
    const { useAuth } = await import('./useAuth');
    const { authLoading, fetchCurrentUser } = withRouter(() => useAuth());
    authLoading.value = false;
    await fetchCurrentUser();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  describe('logout', () => {
    const mockUser: MeResponse = {
      id: 'u1',
      displayName: 'Alice',
      email: 'alice@example.com',
      role: 'ViewerCompany',
      avatarUrl: null,
      bannedAt: null,
      mutedAt: null,
    };

    it('clears user, resets authLoading, calls invalidateRouterCache and router.push on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const { useAuth } = await import('./useAuth');
      const {
        result: { user, authLoading, logout },
        router,
      } = withRouterFull(() => useAuth());
      user.value = mockUser;

      const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined as never);

      await logout();

      expect(user.value).toBeNull();
      expect(authLoading.value).toBe(true);
      expect(mockInvalidateRouterCache).toHaveBeenCalled();
      expect(pushSpy).toHaveBeenCalledWith('/');
    });

    it('returns early without clearing user when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { useAuth } = await import('./useAuth');
      const { user, logout } = withRouter(() => useAuth());
      user.value = mockUser;

      await logout();

      expect(user.value).toEqual(mockUser);
    });

    it('returns early without clearing user when fetch response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { useAuth } = await import('./useAuth');
      const { user, logout } = withRouter(() => useAuth());
      user.value = mockUser;

      await logout();

      expect(user.value).toEqual(mockUser);
    });
  });

  it('concurrent calls to fetchCurrentUser result in only one network request', async () => {
    let resolveFirst!: (value: Response) => void;
    const firstFetchPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    const mockUser = {
      id: 'u1',
      displayName: 'Alice',
      email: 'alice@example.com',
      role: 'ViewerCompany',
      avatarUrl: null,
      bannedAt: null,
      mutedAt: null,
    };

    global.fetch = vi.fn().mockReturnValueOnce(firstFetchPromise);

    const { useAuth } = await import('./useAuth');
    const { fetchCurrentUser } = withRouter(() => useAuth());

    // Fire two concurrent calls
    const p1 = fetchCurrentUser();
    const p2 = fetchCurrentUser();

    // Resolve the single pending fetch
    resolveFirst({
      ok: true,
      json: () => Promise.resolve(mockUser),
    } as Response);

    await Promise.all([p1, p2]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

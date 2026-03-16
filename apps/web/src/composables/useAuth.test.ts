import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp as createVueApp } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';

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
});

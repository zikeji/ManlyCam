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
    const { user, fetchCurrentUser } = withRouter(() => useAuth());
    await fetchCurrentUser();
    expect(user.value).toEqual(mockUser);
  });

  it('fetchCurrentUser sets user to null on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
    } as Response);

    const { useAuth } = await import('./useAuth');
    const { user, fetchCurrentUser } = withRouter(() => useAuth());
    await fetchCurrentUser();
    expect(user.value).toBeNull();
  });
});

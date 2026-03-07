import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));
vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

import { Hono } from 'hono';
import { getSessionUser } from '../services/authService.js';
import { authMiddleware } from './auth.js';
import type { AppEnv } from '../lib/types.js';

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets user in context when valid session cookie exists', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.get('/test', (c) => c.json({ user: c.get('user') }));

    const res = await app.request('/test', { headers: { cookie: 'session_id=valid-session' } });
    const body = await res.json();
    expect(body.user).toEqual(mockUser);
    expect(getSessionUser).toHaveBeenCalledWith('valid-session');
  });

  it('sets user to null when no session cookie present', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.get('/test', (c) => c.json({ user: c.get('user') }));

    const res = await app.request('/test');
    const body = await res.json();
    expect(body.user).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });
});

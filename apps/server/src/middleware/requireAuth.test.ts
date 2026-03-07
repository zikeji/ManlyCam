import { describe, it, expect, vi } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));
vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

import { Hono } from 'hono';
import { authMiddleware } from './auth.js';
import { requireAuth } from './requireAuth.js';
import { getSessionUser } from '../services/authService.js';
import type { AppEnv } from '../lib/types.js';

describe('requireAuth', () => {
  it('passes to next handler when user is authenticated', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.use('*', requireAuth);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected', {
      headers: { cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 401 UNAUTHORIZED when user is not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.use('*', requireAuth);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error).toEqual({ code: 'UNAUTHORIZED' });
  });
});

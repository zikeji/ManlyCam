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
import { requireAuth } from './requireAuth.js';
import { requireRole } from './requireRole.js';
import type { AppEnv } from '../lib/types.js';
import { Role } from '@manlycam/types';

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeApp = (role: string) => {
    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.use('*', requireAuth);
    app.use('*', requireRole(role as Role));
    app.get('/admin', (c) => c.json({ ok: true }));
    return app;
  };

  it('passes when user role is at least the min role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1',
      role: 'Admin',
      bannedAt: null,
    } as never);
    const res = await makeApp('Admin').request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 403 FORBIDDEN when user role is below the min role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1',
      role: 'ViewerCompany',
      bannedAt: null,
    } as never);
    const res = await makeApp('Admin').request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBeDefined();
  });

  it('returns 403 FORBIDDEN for ViewerGuest accessing Moderator route', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1',
      role: 'ViewerGuest',
      bannedAt: null,
    } as never);
    const res = await makeApp('Moderator').request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBeDefined();
  });

  it('passes for Moderator role when min role is Moderator', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'u1',
      role: 'Moderator',
      bannedAt: null,
    } as never);
    const res = await makeApp('Moderator').request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(200);
  });
});

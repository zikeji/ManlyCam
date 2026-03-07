import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
  },
}));

vi.mock('../services/authService.js', () => ({
  initiateOAuth: vi.fn(() => ({
    state: 'test-state-value',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
  })),
  processOAuthCallback: vi.fn(),
  destroySession: vi.fn(),
}));

vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));

import { createApp } from '../app.js';
import { initiateOAuth, destroySession } from '../services/authService.js';

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/auth/google', () => {
    it('redirects to Google OAuth URL', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/google');
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('accounts.google.com');
    });

    it('sets oauth_state cookie', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/google');
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).toContain('oauth_state=');
      expect(cookieHeader).toContain('HttpOnly');
    });

    it('calls initiateOAuth to generate state and URL', async () => {
      const app = createApp();
      await app.request('/api/auth/google');
      expect(initiateOAuth).toHaveBeenCalledOnce();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns { ok: true }', async () => {
      vi.mocked(destroySession).mockResolvedValue();
      const app = createApp();
      const res = await app.request('/api/auth/logout', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it('clears session_id cookie', async () => {
      vi.mocked(destroySession).mockResolvedValue();
      const app = createApp();
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: 'session_id=some-session' },
      });
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).toContain('session_id=');
    });
  });
});

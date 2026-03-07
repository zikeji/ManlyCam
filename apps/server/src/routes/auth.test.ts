import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    BASE_URL: 'http://localhost:3000',
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
import { initiateOAuth, destroySession, processOAuthCallback } from '../services/authService.js';

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

    it('sets oauth_state cookie with correct security attributes', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/google');
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).toContain('oauth_state=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Lax');
      expect(cookieHeader).toContain('Max-Age=600');
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

    it('calls destroySession with the session ID', async () => {
      vi.mocked(destroySession).mockResolvedValue();
      const app = createApp();
      await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: 'session_id=test-session-123' },
      });
      expect(destroySession).toHaveBeenCalledWith('test-session-123');
    });

    it('clears session_id cookie with correct attributes', async () => {
      vi.mocked(destroySession).mockResolvedValue();
      const app = createApp();
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: 'session_id=some-session' },
      });
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).toContain('session_id=');
      expect(cookieHeader).toContain('Max-Age=0');
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('completes successful OAuth callback and sets session cookie', async () => {
      vi.mocked(processOAuthCallback).mockResolvedValue({
        sessionId: 'session-123',
        redirectTo: '/',
      });
      const app = createApp();
      const res = await app.request('/api/auth/google/callback?code=auth-code&state=test-state', {
        headers: { cookie: 'oauth_state=test-state' },
      });
      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe('/');
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).toContain('session_id=session-123');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Strict');
      expect(cookieHeader).toContain('Max-Age=' + 60 * 60 * 24 * 30);
    });

    it('returns 401 when state parameter is missing', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/google/callback?code=auth-code', {
        headers: { cookie: 'oauth_state=test-state' },
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 when code parameter is missing', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/google/callback?state=test-state', {
        headers: { cookie: 'oauth_state=test-state' },
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 when oauth_state cookie is missing', async () => {
      const app = createApp();
      const res = await app.request('/api/auth/google/callback?code=auth-code&state=some-state');
      // expectedState will be null/undefined since cookie is missing
      expect(res.status).toBe(401);
    });

    it('redirects to /rejected and does not set session cookie when user is not on allowlist', async () => {
      vi.mocked(processOAuthCallback).mockResolvedValue({
        sessionId: null,
        redirectTo: '/rejected',
      });
      const app = createApp();
      const res = await app.request('/api/auth/google/callback?code=auth-code&state=test-state', {
        headers: { cookie: 'oauth_state=test-state' },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/rejected');
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).not.toContain('session_id=');
    });

    it('redirects to /banned and does not set session cookie when existing user is banned', async () => {
      vi.mocked(processOAuthCallback).mockResolvedValue({ sessionId: null, redirectTo: '/banned' });
      const app = createApp();
      const res = await app.request('/api/auth/google/callback?code=auth-code&state=test-state', {
        headers: { cookie: 'oauth_state=test-state' },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/banned');
      const cookieHeader = res.headers.get('set-cookie') ?? '';
      expect(cookieHeader).not.toContain('session_id=');
    });
  });
});

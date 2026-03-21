import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from './lib/errors.js';
import { env } from './env.js';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => '<html>mocked</html>'),
  };
});

vi.mock('@hono/node-server/serve-static', () => ({
  serveStatic: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

vi.mock('./env.js', () => ({
  env: {
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
  },
}));

vi.mock('./db/client.js', () => ({ prisma: {} }));
vi.mock('./lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('./middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => next()),
}));
vi.mock('./services/streamService.js', () => ({
  streamService: { getState: vi.fn(), start: vi.fn(), stop: vi.fn(), setAdminToggle: vi.fn() },
  StreamService: vi.fn(),
}));
vi.mock('./services/wsHub.js', () => ({ wsHub: { broadcast: vi.fn(), addClient: vi.fn() } }));
vi.mock('./services/authService.js', () => ({
  initiateOAuth: vi.fn(),
  processOAuthCallback: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
}));

import { createApp } from './app.js';

describe('createApp() global error handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 with INTERNAL_ERROR for unhandled non-AppError', async () => {
    const { app } = createApp();
    app.get('/test-unhandled-error', () => {
      throw new Error('unexpected boom');
    });
    const res = await app.request('/test-unhandled-error');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('returns appropriate status and code for AppError', async () => {
    const { app } = createApp();
    app.get('/test-app-error', () => {
      throw new AppError('Custom error message', 'CUSTOM_ERROR', 400);
    });
    const res = await app.request('/test-app-error');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: 'CUSTOM_ERROR', message: 'Custom error message' },
    });
  });

  it('serves SPA and sets cache headers in production', async () => {
    const originalEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    const { app } = createApp();

    const emojiRes = await app.request('/emojis/test.svg');
    expect(emojiRes.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    const spaRes = await app.request('/some-random-path');
    expect(spaRes.status).toBe(200);
    const text = await spaRes.text();
    expect(text).toBe('<html>mocked</html>');
    expect(readFileSync).toHaveBeenCalled();

    env.NODE_ENV = originalEnv;
  });
});

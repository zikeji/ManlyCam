import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from './lib/errors.js';
import { env } from './env.js';
import { readFileSync } from 'node:fs';

const { mockExistsSync } = vi.hoisted(() => ({ mockExistsSync: vi.fn(() => true) }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    readFileSync: vi.fn(
      () => '<html><head><title>ManlyCam</title></head><body>mocked</body></html>',
    ),
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

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));
vi.mock('./db/client.js', () => ({
  prisma: { clip: { findFirst: mockFindFirst } },
}));
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
    expect(text).toBe('<html><head><title>ManlyCam</title></head><body>mocked</body></html>');

    env.NODE_ENV = originalEnv;
  });
});

describe('GET /clips/:id — OG injection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns plain index.html when clip is not public (private)', async () => {
    mockFindFirst.mockResolvedValue({
      visibility: 'private',
      name: 'My Clip',
      description: null,
      thumbnailKey: null,
    });
    const { app } = createApp();
    const res = await app.request('/clips/clip-001');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('<html><head><title>ManlyCam</title></head><body>mocked</body></html>');
    expect(text).not.toContain('og:title');
  });

  it('returns plain index.html when clip is shared (not public)', async () => {
    mockFindFirst.mockResolvedValue({
      visibility: 'shared',
      name: 'Shared Clip',
      description: null,
      thumbnailKey: null,
    });
    const { app } = createApp();
    const res = await app.request('/clips/clip-002');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('og:title');
  });

  it('returns plain index.html when clip is not found (null)', async () => {
    mockFindFirst.mockResolvedValue(null);
    const { app } = createApp();
    const res = await app.request('/clips/clip-missing');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('og:title');
  });

  it('injects OG meta tags when clip is public', async () => {
    mockFindFirst.mockResolvedValue({
      visibility: 'public',
      name: 'Awesome Clip',
      description: 'A great moment',
      thumbnailKey: 'thumb.jpg',
    });
    const { app } = createApp();
    const res = await app.request('/clips/clip-001');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('og:title');
    expect(text).toContain('content="Awesome Clip"');
    expect(text).toContain('og:description');
    expect(text).toContain('content="A great moment"');
    expect(text).toContain('og:image');
    expect(text).toContain('/api/clips/clip-001/thumbnail');
    expect(text).toContain('og:url');
    expect(text).toContain('http://localhost:3000/clips/clip-001');
    expect(text).toContain('<title>Awesome Clip</title>');
  });

  it('uses default description when clip.description is null', async () => {
    mockFindFirst.mockResolvedValue({
      visibility: 'public',
      name: 'No Desc Clip',
      description: null,
      thumbnailKey: null,
    });
    const { app } = createApp();
    const res = await app.request('/clips/clip-nodesc');
    const text = await res.text();
    expect(text).toContain('Watch this clip');
  });

  it('escapes HTML special characters in OG content', async () => {
    mockFindFirst.mockResolvedValue({
      visibility: 'public',
      name: 'Clip <script> & "test"',
      description: 'Desc with <b>html</b> & "quotes"',
      thumbnailKey: null,
    });
    const { app } = createApp();
    const res = await app.request('/clips/clip-escape');
    const text = await res.text();
    expect(text).toContain('Clip &lt;script&gt; &amp; &quot;test&quot;');
    expect(text).toContain('Desc with &lt;b&gt;html&lt;/b&gt; &amp; &quot;quotes&quot;');
    expect(text).not.toContain('<script>');
  });

  it('falls through to plain index.html on DB error', async () => {
    mockFindFirst.mockRejectedValue(new Error('DB connection failed'));
    const { app } = createApp();
    const res = await app.request('/clips/clip-dberror');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('<html><head><title>ManlyCam</title></head><body>mocked</body></html>');
    expect(text).not.toContain('og:title');
  });

  it('returns minimal placeholder when index.html does not exist (dev without build)', async () => {
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const { app } = createApp();
    const res = await app.request('/clips/clip-nofile');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<html>');
    expect(text).not.toContain('og:title');
  });

  it('queries prisma.clip.findFirst with id and deletedAt: null filter', async () => {
    mockFindFirst.mockResolvedValue(null);
    const { app } = createApp();
    await app.request('/clips/clip-querycheck');
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'clip-querycheck', deletedAt: null },
      select: { visibility: true, name: true, description: true, thumbnailKey: true },
    });
  });
});

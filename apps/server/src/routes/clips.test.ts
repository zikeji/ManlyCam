import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    message: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01HZTEST00000000000000001') }));

vi.mock('../services/authService.js', () => ({
  initiateOAuth: vi.fn(),
  processOAuthCallback: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock('../services/streamService.js', () => ({
  streamService: {
    getState: vi.fn(),
    setAdminToggle: vi.fn(),
    isPiReachable: vi.fn(),
  },
}));

vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn(), sendToUser: vi.fn() },
}));

vi.mock('../services/clipService.js', () => ({
  createClip: vi.fn(),
  getClip: vi.fn(),
  getClipDownloadUrl: vi.fn(),
  getSegmentRange: vi.fn(),
}));

import { getSessionUser } from '../services/authService.js';
import { createClip, getClip, getClipDownloadUrl, getSegmentRange } from '../services/clipService.js';
import { AppError } from '../lib/errors.js';
import { createApp } from '../app.js';

const mockUser = {
  id: 'user-001',
  googleSub: 'sub',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'Viewer',
  avatarUrl: null,
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
};

describe('POST /api/clips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: 'Test',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 when startTime missing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({ endTime: '2026-03-22T10:00:07.000Z', name: 'Test' }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when endTime missing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({ startTime: '2026-03-22T10:00:01.000Z', name: 'Test' }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when name missing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when name is whitespace-only', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: '   ',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when description is not a string', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: 'Test',
        description: 123,
      }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when shareToChat is not a boolean', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: 'Test',
        shareToChat: 'yes',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 201 on valid request', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(createClip).mockResolvedValue({ id: 'clip-001', status: 'pending' });
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: 'Test Clip',
        shareToChat: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe('clip-001');
    expect(body.status).toBe('pending');
  });

  it('passes optional description and shareToChat to createClip', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(createClip).mockResolvedValue({ id: 'clip-001', status: 'pending' });
    await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: 'Test',
        description: 'A description',
      }),
    });
    expect(createClip).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'A description', shareToChat: false }),
    );
  });

  it('propagates AppError from service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(createClip).mockRejectedValue(
      new AppError('Stream has not started', 'STREAM_NOT_STARTED', 422),
    );
    const res = await createApp().app.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid' },
      body: JSON.stringify({
        startTime: '2026-03-22T10:00:01.000Z',
        endTime: '2026-03-22T10:00:07.000Z',
        name: 'Test',
      }),
    });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/clips/:clipId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with clip data', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(getClip).mockResolvedValue({ id: 'clip-001', name: 'Test' } as never);
    const res = await createApp().app.request('/api/clips/clip-001', {
      headers: { cookie: 'session_id=valid' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('clip-001');
  });

  it('returns 404 when clip not found', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(getClip).mockRejectedValue(new AppError('Not found', 'NOT_FOUND', 404));
    const res = await createApp().app.request('/api/clips/clip-001');
    expect(res.status).toBe(404);
  });

  it('returns 401 for unauthenticated private clip', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(getClip).mockRejectedValue(new AppError('Unauthorized', 'UNAUTHORIZED', 401));
    const res = await createApp().app.request('/api/clips/clip-001');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/clips/:clipId/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 302 redirect for owner', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(getClipDownloadUrl).mockResolvedValue('https://presigned.example.com/video');
    const res = await createApp().app.request('/api/clips/clip-001/download', {
      headers: { cookie: 'session_id=valid' },
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://presigned.example.com/video');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(getClipDownloadUrl).mockRejectedValue(
      new AppError('Unauthorized', 'UNAUTHORIZED', 401),
    );
    const res = await createApp().app.request('/api/clips/clip-001/download');
    expect(res.status).toBe(401);
  });

  it('returns 409 when clip not ready', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(getClipDownloadUrl).mockRejectedValue(
      new AppError('Clip not ready', 'CLIP_NOT_READY', 409),
    );
    const res = await createApp().app.request('/api/clips/clip-001/download', {
      headers: { cookie: 'session_id=valid' },
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/clips/segment-range', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/clips/segment-range');
    expect(res.status).toBe(401);
  });

  it('returns 200 with segment range', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(getSegmentRange).mockResolvedValue({
      earliest: '2026-03-22T10:00:00.000Z',
      latest: '2026-03-22T10:05:00.000Z',
    });
    const res = await createApp().app.request('/api/clips/segment-range', {
      headers: { cookie: 'session_id=valid' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { earliest: string; latest: string };
    expect(body.earliest).toBe('2026-03-22T10:00:00.000Z');
    expect(body.latest).toBe('2026-03-22T10:05:00.000Z');
  });

  it('propagates AppError from service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(getSegmentRange).mockRejectedValue(
      new AppError('Stream has not started', 'STREAM_NOT_STARTED', 422),
    );
    const res = await createApp().app.request('/api/clips/segment-range', {
      headers: { cookie: 'session_id=valid' },
    });
    expect(res.status).toBe(422);
  });
});

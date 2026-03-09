import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));

vi.mock('../db/client.js', () => ({
  prisma: { message: { create: vi.fn() } },
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
  wsHub: { broadcast: vi.fn(), addClient: vi.fn() },
}));

vi.mock('../services/chatService.js', () => ({
  createMessage: vi.fn(),
}));

import { getSessionUser } from '../services/authService.js';
import { createMessage } from '../services/chatService.js';
import { createApp } from '../app.js';

const mockUser = {
  id: 'user-001',
  googleSub: 'google-sub',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'ViewerCompany',
  avatarUrl: null,
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
};

const mockChatMessage = {
  id: '01HZTEST00000000000000001',
  userId: 'user-001',
  displayName: 'Test User',
  avatarUrl: null,
  content: 'Hello world',
  editHistory: null,
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-03-08T10:00:00.000Z',
  userTag: null,
};

describe('POST /api/chat/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello' }),
    });

    expect(res.status).toBe(401);
  });

  it('returns 201 with message on valid body', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(createMessage).mockResolvedValue(mockChatMessage);

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({ content: 'Hello world' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { message: typeof mockChatMessage };
    expect(body.message).toEqual(mockChatMessage);
  });

  it('returns 422 on empty content', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({ content: '' }),
    });

    expect(res.status).toBe(422);
  });

  it('returns 422 on whitespace-only content', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({ content: '   ' }),
    });

    expect(res.status).toBe(422);
  });

  it('returns 422 on content exceeding 1000 characters', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({ content: 'a'.repeat(1001) }),
    });

    expect(res.status).toBe(422);
  });

  it('returns 422 when content is missing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(422);
  });

  it('accepts exactly 1000 character content', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(createMessage).mockResolvedValue({ ...mockChatMessage, content: 'a'.repeat(1000) });

    const res = await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({ content: 'a'.repeat(1000) }),
    });

    expect(res.status).toBe(201);
  });

  it('calls createMessage with userId and content', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(createMessage).mockResolvedValue(mockChatMessage);

    await createApp().app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
      body: JSON.stringify({ content: 'Hello world' }),
    });

    expect(createMessage).toHaveBeenCalledWith({ userId: 'user-001', content: 'Hello world' });
  });
});

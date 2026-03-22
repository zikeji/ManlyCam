import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));

vi.mock('../db/client.js', () => ({ prisma: {} }));

vi.mock('../services/authService.js', () => ({
  initiateOAuth: vi.fn(),
  processOAuthCallback: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock('../services/streamService.js', () => ({
  streamService: { getState: vi.fn(), setAdminToggle: vi.fn(), isPiReachable: vi.fn() },
}));

vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn() },
}));

vi.mock('../services/reactionsService.js', () => ({
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  removeReactionByMod: vi.fn(),
}));

import { getSessionUser } from '../services/authService.js';
import { addReaction, removeReaction, removeReactionByMod } from '../services/reactionsService.js';
import { AppError } from '../lib/errors.js';
import { createApp } from '../app.js';

const makeUser = (role: string, id = 'user-001') => ({
  id,
  googleSub: 'google-sub',
  email: 'user@example.com',
  displayName: 'Test User',
  role,
  avatarUrl: null,
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
});

const authHeaders = { headers: { cookie: 'session_id=valid-session' } };

describe('POST /api/messages/:messageId/reactions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/messages/msg-001/reactions', {
      method: 'POST',
      body: JSON.stringify({ emoji: 'thumbs_up' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 422 when emoji is missing', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    const res = await createApp().app.request('/api/messages/msg-001/reactions', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(422);
  });

  it('returns 201 on successful reaction add', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    const payload = {
      messageId: 'msg-001',
      userId: 'user-001',
      displayName: 'Test User',
      role: 'ViewerCompany' as const,
      emoji: 'thumbs_up',
      createdAt: new Date().toISOString(),
    };
    vi.mocked(addReaction).mockResolvedValue(payload);
    const res = await createApp().app.request('/api/messages/msg-001/reactions', {
      method: 'POST',
      body: JSON.stringify({ emoji: 'thumbs_up' }),
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(201);
    expect(addReaction).toHaveBeenCalledWith({
      messageId: 'msg-001',
      userId: 'user-001',
      emoji: 'thumbs_up',
    });
  });

  it('returns 403 when muted user tries to react', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    vi.mocked(addReaction).mockRejectedValue(
      new AppError('Cannot react while muted', 'FORBIDDEN', 403),
    );
    const res = await createApp().app.request('/api/messages/msg-001/reactions', {
      method: 'POST',
      body: JSON.stringify({ emoji: 'thumbs_up' }),
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when message not found', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    vi.mocked(addReaction).mockRejectedValue(new AppError('Message not found', 'NOT_FOUND', 404));
    const res = await createApp().app.request('/api/messages/msg-001/reactions', {
      method: 'POST',
      body: JSON.stringify({ emoji: 'thumbs_up' }),
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when body is invalid JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    const res = await createApp().app.request('/api/messages/msg-001/reactions', {
      method: 'POST',
      body: 'not-valid-json{',
      headers: { 'Content-Type': 'application/json', cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(400);
    expect(addReaction).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/messages/:messageId/reactions/:emoji', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/messages/msg-001/reactions/thumbs_up', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });

  it('returns 204 on successful reaction remove', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    vi.mocked(removeReaction).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/messages/msg-001/reactions/thumbs_up', {
      method: 'DELETE',
      ...authHeaders,
    });
    expect(res.status).toBe(204);
    expect(removeReaction).toHaveBeenCalledWith({
      messageId: 'msg-001',
      userId: 'user-001',
      emoji: 'thumbs_up',
    });
  });

  it('decodes URI-encoded emoji in path', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    vi.mocked(removeReaction).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/messages/msg-001/reactions/red_heart', {
      method: 'DELETE',
      ...authHeaders,
    });
    expect(res.status).toBe(204);
    expect(removeReaction).toHaveBeenCalledWith(expect.objectContaining({ emoji: 'red_heart' }));
  });
});

describe('DELETE /api/messages/:messageId/reactions/:emoji/users/:userId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request(
      '/api/messages/msg-001/reactions/thumbs_up/users/target-001',
      { method: 'DELETE' },
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is ViewerCompany', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('ViewerCompany') as never);
    const res = await createApp().app.request(
      '/api/messages/msg-001/reactions/thumbs_up/users/target-001',
      { method: 'DELETE', ...authHeaders },
    );
    expect(res.status).toBe(403);
    expect(removeReactionByMod).not.toHaveBeenCalled();
  });

  it('returns 204 on successful mod remove', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('Moderator') as never);
    vi.mocked(removeReactionByMod).mockResolvedValue(undefined);
    const res = await createApp().app.request(
      '/api/messages/msg-001/reactions/thumbs_up/users/target-001',
      { method: 'DELETE', ...authHeaders },
    );
    expect(res.status).toBe(204);
    expect(removeReactionByMod).toHaveBeenCalledWith({
      messageId: 'msg-001',
      targetUserId: 'target-001',
      emoji: 'thumbs_up',
      modId: 'user-001',
      modRole: 'Moderator',
    });
  });

  it('returns 403 when mod has insufficient rank over target', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('Moderator') as never);
    vi.mocked(removeReactionByMod).mockRejectedValue(
      new AppError(
        'Cannot remove reactions from users with equal or higher role.',
        'INSUFFICIENT_ROLE',
        403,
      ),
    );
    const res = await createApp().app.request(
      '/api/messages/msg-001/reactions/thumbs_up/users/target-001',
      { method: 'DELETE', ...authHeaders },
    );
    expect(res.status).toBe(403);
  });

  it('re-throws non-INSUFFICIENT_ROLE errors from removeReactionByMod', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser('Moderator') as never);
    vi.mocked(removeReactionByMod).mockRejectedValue(new Error('unexpected database error'));
    const res = await createApp().app.request(
      '/api/messages/msg-001/reactions/thumbs_up/users/target-001',
      { method: 'DELETE', ...authHeaders },
    );
    expect(res.status).toBe(500);
  });
});

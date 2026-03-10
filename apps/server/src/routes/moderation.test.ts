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

vi.mock('../services/moderationService.js', () => ({
  muteUser: vi.fn(),
  unmuteUser: vi.fn(),
  banUser: vi.fn(),
}));

import { getSessionUser } from '../services/authService.js';
import { muteUser, unmuteUser, banUser } from '../services/moderationService.js';
import { AppError } from '../lib/errors.js';
import { createApp } from '../app.js';

const mockAdmin = {
  id: 'actor-001',
  googleSub: 'google-sub',
  email: 'admin@example.com',
  displayName: 'Admin User',
  role: 'Admin',
  avatarUrl: null,
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
};

const mockViewer = { ...mockAdmin, id: 'viewer-001', role: 'ViewerCompany' };
const authHeaders = { headers: { cookie: 'session_id=valid-session' } };

describe('POST /api/users/:userId/mute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/users/target-001/mute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is ViewerCompany (requireRole blocks)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockViewer as never);
    const res = await createApp().app.request('/api/users/target-001/mute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(403);
    expect(muteUser).not.toHaveBeenCalled();
  });

  it('returns 204 on successful mute', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(muteUser).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/users/target-001/mute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(204);
    expect(muteUser).toHaveBeenCalledWith({
      actorId: 'actor-001',
      actorRole: 'Admin',
      targetUserId: 'target-001',
    });
  });

  it('propagates INSUFFICIENT_ROLE 403 from service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(muteUser).mockRejectedValue(
      new AppError('Cannot moderate users with equal or higher role.', 'INSUFFICIENT_ROLE', 403),
    );
    const res = await createApp().app.request('/api/users/target-001/mute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('propagates NOT_FOUND 404 from service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(muteUser).mockRejectedValue(new AppError('User not found.', 'NOT_FOUND', 404));
    const res = await createApp().app.request('/api/users/target-001/mute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/users/:userId/unmute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/users/target-001/unmute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is ViewerGuest (requireRole blocks)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...mockViewer, role: 'ViewerGuest' } as never);
    const res = await createApp().app.request('/api/users/target-001/unmute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(403);
    expect(unmuteUser).not.toHaveBeenCalled();
  });

  it('returns 204 on successful unmute', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(unmuteUser).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/users/target-001/unmute', {
      method: 'POST',
      ...authHeaders,
    });
    expect(res.status).toBe(204);
    expect(unmuteUser).toHaveBeenCalledWith({
      actorId: 'actor-001',
      actorRole: 'Admin',
      targetUserId: 'target-001',
    });
  });
});

describe('DELETE /api/users/:userId/ban', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/users/target-001/ban', {
      method: 'DELETE',
      ...authHeaders,
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is ViewerCompany (requireRole blocks)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockViewer as never);
    const res = await createApp().app.request('/api/users/target-001/ban', {
      method: 'DELETE',
      ...authHeaders,
    });
    expect(res.status).toBe(403);
    expect(banUser).not.toHaveBeenCalled();
  });

  it('returns 204 on successful ban', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(banUser).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/users/target-001/ban', {
      method: 'DELETE',
      ...authHeaders,
    });
    expect(res.status).toBe(204);
    expect(banUser).toHaveBeenCalledWith({
      actorId: 'actor-001',
      actorRole: 'Admin',
      targetUserId: 'target-001',
    });
  });

  it('propagates INSUFFICIENT_ROLE 403 from service', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(banUser).mockRejectedValue(
      new AppError('Cannot moderate users with equal or higher role.', 'INSUFFICIENT_ROLE', 403),
    );
    const res = await createApp().app.request('/api/users/target-001/ban', {
      method: 'DELETE',
      ...authHeaders,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INSUFFICIENT_ROLE');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { getSessionUser } from '../services/authService.js';
import { Role } from '@manlycam/types';

// --- Mocks ---

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn() },
    chatMessage: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('../services/moderationService.js', () => ({
  muteUser: vi.fn(),
  unmuteUser: vi.fn(),
  banUser: vi.fn(),
}));

// We want to test the REAL mapping in the route,
// but we need to make sure deleteMessage is not mocked out entirely if we want it to throw.
// Actually, it's easier to just mock it to THROW what we expect it to throw.
vi.mock('../services/chatService.js', () => ({
  deleteMessage: vi.fn(),
}));

vi.mock('../services/streamService.js', () => ({
  streamService: {
    setAdminToggle: vi.fn(),
    setCameraSettings: vi.fn(),
    getState: vi.fn(),
    isPiReachable: vi.fn(),
  },
}));

import { deleteMessage } from '../services/chatService.js';
import { AppError } from '../lib/errors.js';

describe('Gating Audit (Server Routes)', () => {
  const { app } = createApp();

  const mockUser = (role: Role) => ({
    id: 'user-001',
    googleSub: 'sub',
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

  const authHeaders = { headers: { cookie: 'session_id=valid' } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Moderation Endpoints (Moderator required)', () => {
    const endpoints = [
      { method: 'POST', path: '/api/users/target-001/mute' },
      { method: 'POST', path: '/api/users/target-001/unmute' },
      { method: 'DELETE', path: '/api/users/target-001/ban' },
    ];

    endpoints.forEach(({ method, path }) => {
      it(`AC 3: ${method} ${path} returns 403 for ViewerCompany`, async () => {
        vi.mocked(getSessionUser).mockResolvedValue(mockUser(Role.ViewerCompany) as never);

        const res = await app.request(path, { method, ...authHeaders });
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('FORBIDDEN');
      });
    });

    it('AC 3: DELETE /api/chat/messages/msg-001 returns 403 for ViewerCompany (others message)', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(mockUser(Role.ViewerCompany) as never);
      // Mock the service to throw INSUFFICIENT_ROLE like the real one would
      vi.mocked(deleteMessage).mockRejectedValue(
        new AppError('Insufficient role', 'INSUFFICIENT_ROLE', 403),
      );

      const res = await app.request('/api/chat/messages/msg-001', {
        method: 'DELETE',
        ...authHeaders,
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Stream/Camera Endpoints (Admin required)', () => {
    const endpoints = [
      { method: 'POST', path: '/api/stream/start' },
      { method: 'POST', path: '/api/stream/stop' },
      { method: 'PATCH', path: '/api/stream/camera-settings', body: {} },
    ];

    const restrictedRoles = [Role.Moderator, Role.ViewerCompany, Role.ViewerGuest];

    restrictedRoles.forEach((role) => {
      endpoints.forEach(({ method, path, body }) => {
        it(`AC 4: ${method} ${path} returns 403 for ${role}`, async () => {
          vi.mocked(getSessionUser).mockResolvedValue(mockUser(role) as never);

          const res = await app.request(path, {
            method,
            ...authHeaders,
            body: body ? JSON.stringify(body) : undefined,
            headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
          });
          expect(res.status).toBe(403);
          const responseBody = (await res.json()) as { error: { code: string } };
          expect(responseBody.error.code).toBe('FORBIDDEN');
        });
      });
    });
  });
});

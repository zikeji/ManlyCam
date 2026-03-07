import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing authService
vi.mock('../db/client.js', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock ulid to return predictable values
vi.mock('../lib/ulid.js', () => ({
  ulid: vi.fn(() => '01JTEST00000000000000000000'),
}));

// Mock env so authService can import without process.env set up
vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    BASE_URL: 'http://localhost:3000',
  },
}));

import { prisma } from '../db/client.js';
import { createSession, destroySession, getSessionUser, handleCallback, processOAuthCallback } from './authService.js';

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('returns a ULID session id', async () => {
      vi.mocked(prisma.session.create).mockResolvedValue({} as never);
      const sessionId = await createSession('user-123');
      expect(sessionId).toBe('01JTEST00000000000000000000');
    });

    it('inserts session row with correct userId and 30-day expiresAt', async () => {
      vi.mocked(prisma.session.create).mockResolvedValue({} as never);
      const before = Date.now();
      await createSession('user-abc');
      const after = Date.now();

      const call = vi.mocked(prisma.session.create).mock.calls[0]![0];
      expect(call.data.userId).toBe('user-abc');
      expect(call.data.id).toBe('01JTEST00000000000000000000');

      const expiresAt = (call.data.expiresAt as Date).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + thirtyDaysMs + 1000);
    });
  });

  describe('destroySession', () => {
    it('deletes the session row by id', async () => {
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });
      await destroySession('session-xyz');
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { id: 'session-xyz' } });
    });
  });

  describe('getSessionUser', () => {
    it('returns null when session not found', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
      const result = await getSessionUser('missing-session');
      expect(result).toBeNull();
    });

    it('returns null for expired session', async () => {
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        createdAt: new Date(),
        user: { id: 'user-1', email: 'test@example.com' },
      } as never);
      const result = await getSessionUser('sess-1');
      expect(result).toBeNull();
    });

    it('returns the user for a valid session', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', displayName: 'Test User' };
      vi.mocked(prisma.session.findUnique).mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
        createdAt: new Date(),
        user: mockUser,
      } as never);
      const result = await getSessionUser('sess-1');
      expect(result).toEqual(mockUser);
    });
  });

  describe('handleCallback (CSRF validation)', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('throws 401 UNAUTHORIZED when state does not match (CSRF protection)', async () => {
      const result = handleCallback('auth-code', 'wrong-state', 'expected-state');
      await expect(result).rejects.toThrow('Invalid OAuth state');
    });

    it('throws 401 UNAUTHORIZED when expected state is not provided', async () => {
      const result = handleCallback('auth-code', 'some-state', null as never);
      await expect(result).rejects.toThrow('Invalid OAuth state');
    });

    it('successfully fetches Google profile when state matches', async () => {
      const mockTokenResponse = {
        ok: true,
        json: () => Promise.resolve({ access_token: 'test-token' }),
      };
      const mockUserResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'google-123',
            email: 'user@example.com',
            name: 'Test User',
            picture: 'https://example.com/avatar.jpg',
          }),
      };

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockTokenResponse)
        .mockResolvedValueOnce(mockUserResponse);

      const result = await handleCallback('auth-code', 'test-state', 'test-state');
      expect(result).toEqual({
        googleSub: 'google-123',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
    });

    it('throws when token exchange returns non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({ ok: false });
      await expect(handleCallback('code', 'state', 'state')).rejects.toThrow(
        'Failed to exchange OAuth code',
      );
    });

    it('throws when userinfo endpoint returns non-ok response', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'tok' }) })
        .mockResolvedValueOnce({ ok: false });
      await expect(handleCallback('code', 'state', 'state')).rejects.toThrow(
        'Failed to fetch Google user profile',
      );
    });
  });

  describe('processOAuthCallback', () => {
    beforeEach(() => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'tok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sub: 'google-123',
              email: 'user@example.com',
              name: 'Test User',
              picture: 'https://example.com/avatar.jpg',
            }),
        });
    });

    it('existing user: updates profile and creates session, returns redirectTo "/"', async () => {
      const existingUser = { id: 'existing-user-id', googleSub: 'google-123', email: 'user@example.com' };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...existingUser, displayName: 'Test User' } as never);
      vi.mocked(prisma.session.create).mockResolvedValue({} as never);

      const result = await processOAuthCallback('code', 'state', 'state');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-user-id' },
          data: expect.objectContaining({
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
          }),
        }),
      );
      expect(result.redirectTo).toBe('/');
      expect(result.sessionId).toBe('01JTEST00000000000000000000');
    });

    it('new user: creates user with ViewerCompany role and creates session, returns redirectTo "/"', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: '01JTEST00000000000000000000',
        role: 'ViewerCompany',
      } as never);
      vi.mocked(prisma.session.create).mockResolvedValue({} as never);

      const result = await processOAuthCallback('code', 'state', 'state');

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleSub: 'google-123',
            email: 'user@example.com',
            role: 'ViewerCompany',
          }),
        }),
      );
      expect(result.redirectTo).toBe('/');
    });
  });
});

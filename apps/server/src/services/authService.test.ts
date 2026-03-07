import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing authService
vi.mock('../db/client.js', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
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
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
  },
}));

import { prisma } from '../db/client.js';
import { createSession, destroySession, getSessionUser } from './authService.js';

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
});

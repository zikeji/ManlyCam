import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
  },
}));

vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../services/streamService.js', () => ({
  streamService: { getState: vi.fn(), start: vi.fn(), stop: vi.fn(), setAdminToggle: vi.fn() },
  StreamService: vi.fn(),
}));
vi.mock('../services/wsHub.js', () => ({ wsHub: { broadcast: vi.fn(), addClient: vi.fn() } }));
vi.mock('../services/authService.js', () => ({
  initiateOAuth: vi.fn(),
  processOAuthCallback: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from '../services/authService.js';
import { createApp } from '../app.js';

const mockUser = {
  id: 'user-001',
  googleSub: 'google-sub-001',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'ViewerCompany',
  avatarUrl: 'https://example.com/avatar.jpg',
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
};

describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 UNAUTHORIZED when no session cookie', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns user profile shape with all fields present', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const app = createApp();
    const res = await app.request('/api/me', {
      headers: { cookie: 'session_id=valid-session' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'user-001',
      displayName: 'Test User',
      email: 'test@example.com',
      role: 'ViewerCompany',
      avatarUrl: 'https://example.com/avatar.jpg',
      bannedAt: null,
      mutedAt: null,
    });
  });

  it('returns null for optional fields, never undefined', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...mockUser,
      avatarUrl: null,
      bannedAt: null,
      mutedAt: null,
    } as never);
    const app = createApp();
    const res = await app.request('/api/me', {
      headers: { cookie: 'session_id=valid-session' },
    });
    const body = await res.json();
    expect(body.avatarUrl).toBeNull();
    expect(body.bannedAt).toBeNull();
    expect(body.mutedAt).toBeNull();
    // Ensure fields are present (not undefined/omitted)
    expect('avatarUrl' in body).toBe(true);
    expect('bannedAt' in body).toBe(true);
    expect('mutedAt' in body).toBe(true);
  });
});

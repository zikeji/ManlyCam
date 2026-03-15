import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    message: { create: vi.fn() },
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
  streamService: { getState: vi.fn(), setAdminToggle: vi.fn(), isPiReachable: vi.fn() },
}));

vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn(), sendToUser: vi.fn() },
}));

vi.mock('../services/chatService.js', () => ({
  createMessage: vi.fn(),
  getHistory: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock('../services/slashCommands.js', () => ({
  loadCommands: vi.fn(),
  getCommands: vi.fn(() => []),
  getCommandsForRole: vi.fn(),
  reloadCommands: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock('../lib/pisugar.js', () => ({
  pisugarService: { start: vi.fn(), stop: vi.fn() },
}));

import { getSessionUser } from '../services/authService.js';
import { getCommandsForRole } from '../services/slashCommands.js';
import { createApp } from '../app.js';

const mockAdminUser = {
  id: 'admin-001',
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

const mockViewerUser = {
  ...mockAdminUser,
  id: 'viewer-001',
  email: 'viewer@example.com',
  displayName: 'Viewer',
  role: 'ViewerCompany',
};

const mockGuestUser = {
  ...mockAdminUser,
  id: 'guest-001',
  email: 'guest@example.com',
  displayName: 'Guest',
  role: 'ViewerGuest',
};

describe('GET /api/commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const res = await createApp().app.request('/api/commands');
    expect(res.status).toBe(401);
  });

  it('returns 200 with commands array for admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdminUser as never);
    vi.mocked(getCommandsForRole).mockReturnValue([
      { name: 'shrug', description: 'Shrug', placeholder: '[message]' },
      { name: 'secret', description: 'Admin cmd' },
    ]);

    const res = await createApp().app.request('/api/commands', {
      headers: { cookie: 'session_id=valid' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { commands: unknown[] };
    expect(body.commands).toHaveLength(2);
    expect(getCommandsForRole).toHaveBeenCalledWith('Admin');
  });

  it('filters commands by ViewerCompany role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockViewerUser as never);
    vi.mocked(getCommandsForRole).mockReturnValue([
      { name: 'shrug', description: 'Shrug', placeholder: '[message]' },
    ]);

    const res = await createApp().app.request('/api/commands', {
      headers: { cookie: 'session_id=valid' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { commands: unknown[] };
    expect(body.commands).toHaveLength(1);
    expect(getCommandsForRole).toHaveBeenCalledWith('ViewerCompany');
  });

  it('filters commands by ViewerGuest role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockGuestUser as never);
    vi.mocked(getCommandsForRole).mockReturnValue([]);

    const res = await createApp().app.request('/api/commands', {
      headers: { cookie: 'session_id=valid' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { commands: unknown[] };
    expect(body.commands).toHaveLength(0);
    expect(getCommandsForRole).toHaveBeenCalledWith('ViewerGuest');
  });

  it('returns 200 with empty commands when no commands loaded', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdminUser as never);
    vi.mocked(getCommandsForRole).mockReturnValue([]);

    const res = await createApp().app.request('/api/commands', {
      headers: { cookie: 'session_id=valid' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { commands: unknown[] };
    expect(body.commands).toEqual([]);
  });

  it('returns commands with name, description, placeholder fields', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdminUser as never);
    vi.mocked(getCommandsForRole).mockReturnValue([
      { name: 'shrug', description: 'Shrug cmd', placeholder: '[message]' },
    ]);

    const res = await createApp().app.request('/api/commands', {
      headers: { cookie: 'session_id=valid' },
    });

    const body = (await res.json()) as {
      commands: { name: string; description: string; placeholder?: string }[];
    };
    expect(body.commands[0]).toMatchObject({
      name: 'shrug',
      description: 'Shrug cmd',
      placeholder: '[message]',
    });
  });
});

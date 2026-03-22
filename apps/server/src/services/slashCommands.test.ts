import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mocks (vi.hoisted runs before vi.mock factories) ---
const { mockReaddirSync, mockExistsSync, mockRequireFn } = vi.hoisted(() => {
  const requireFn = vi.fn() as ReturnType<typeof vi.fn> & {
    cache: Record<string, unknown>;
    resolve: (p: string) => string;
  };
  requireFn.cache = {};
  requireFn.resolve = (p: string) => p;
  return {
    mockReaddirSync: vi.fn((_p: string) => [] as string[]),
    mockExistsSync: vi.fn((_p: string) => true),
    mockRequireFn: requireFn,
  };
});

vi.mock('node:fs', () => ({
  default: {
    existsSync: (p: string) => mockExistsSync(p),
    readdirSync: (p: string) => mockReaddirSync(p),
  },
  existsSync: (p: string) => mockExistsSync(p),
  readdirSync: (p: string) => mockReaddirSync(p),
}));

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => mockRequireFn),
}));

vi.mock('../lib/errors.js', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(message: string, code: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import after mocks
import {
  loadCommands,
  getCommands,
  getCommandsForRole,
  executeCommand,
  reloadCommands,
} from './slashCommands.js';
import { SYSTEM_USER_ID } from '@manlycam/types';
import { logger } from '../lib/logger.js';

describe('slashCommands.loadCommands', () => {
  afterEach(() => {
    // Reset commands between tests
    mockReaddirSync.mockReturnValue([]);
    mockExistsSync.mockReturnValue(true);
    mockRequireFn.mockReset();
    mockRequireFn.cache = {};
    mockRequireFn.resolve = vi.fn((p: string) => p);
    loadCommands();
  });

  it('logs a warning and returns empty when custom dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    loadCommands();
    expect(getCommands()).toHaveLength(0);
  });

  it('loads valid commands from .cjs files', () => {
    mockReaddirSync.mockReturnValue(['shrug.cjs']);
    mockRequireFn.mockReturnValue({
      name: 'shrug',
      description: 'Appends shrug',
      handler: () => ({ content: '¯\\_(ツ)_/¯' }),
    });
    loadCommands();
    expect(getCommands()).toHaveLength(1);
    expect(getCommands()[0].name).toBe('shrug');
  });

  it('loads multiple commands', () => {
    mockReaddirSync.mockReturnValue(['shrug.cjs', 'tableflip.cjs']);
    mockRequireFn
      .mockReturnValueOnce({
        name: 'shrug',
        description: 'Shrug',
        handler: () => ({ content: '¯' }),
      })
      .mockReturnValueOnce({
        name: 'tableflip',
        description: 'Flip',
        handler: () => ({ content: '(╯°□°）╯︵ ┻━┻' }),
      });
    loadCommands();
    expect(getCommands()).toHaveLength(2);
  });

  it('skips files without .cjs extension', () => {
    mockReaddirSync.mockReturnValue(['readme.txt', 'shrug.cjs']);
    mockRequireFn.mockReturnValue({
      name: 'shrug',
      description: 'Shrug',
      handler: () => ({ content: '¯' }),
    });
    loadCommands();
    expect(getCommands()).toHaveLength(1);
  });

  it('skips command with missing name field and logs error', () => {
    mockReaddirSync.mockReturnValue(['bad.cjs']);
    mockRequireFn.mockReturnValue({ description: 'No name', handler: () => ({ content: '' }) });
    loadCommands();
    expect(getCommands()).toHaveLength(0);
  });

  it('skips command with non-string name and logs error', () => {
    mockReaddirSync.mockReturnValue(['bad.cjs']);
    mockRequireFn.mockReturnValue({
      name: 42,
      description: 'Bad',
      handler: () => ({ content: '' }),
    });
    loadCommands();
    expect(getCommands()).toHaveLength(0);
  });

  it('skips command with missing description and logs error', () => {
    mockReaddirSync.mockReturnValue(['bad.cjs']);
    mockRequireFn.mockReturnValue({ name: 'test', handler: () => ({ content: '' }) });
    loadCommands();
    expect(getCommands()).toHaveLength(0);
  });

  it('skips command with missing handler and logs error', () => {
    mockReaddirSync.mockReturnValue(['bad.cjs']);
    mockRequireFn.mockReturnValue({ name: 'test', description: 'Test' });
    loadCommands();
    expect(getCommands()).toHaveLength(0);
  });

  it('skips command with non-function handler and logs error', () => {
    mockReaddirSync.mockReturnValue(['bad.cjs']);
    mockRequireFn.mockReturnValue({ name: 'test', description: 'Test', handler: 'not a function' });
    loadCommands();
    expect(getCommands()).toHaveLength(0);
  });

  it('skips erroring require() and continues loading remaining files', () => {
    mockReaddirSync.mockReturnValue(['bad.cjs', 'good.cjs']);
    mockRequireFn
      .mockImplementationOnce(() => {
        throw new Error('syntax error');
      })
      .mockReturnValueOnce({
        name: 'good',
        description: 'Good',
        handler: () => ({ content: 'ok' }),
      });
    loadCommands();
    expect(getCommands()).toHaveLength(1);
    expect(getCommands()[0].name).toBe('good');
  });

  it('allows duplicate command names', () => {
    mockReaddirSync.mockReturnValue(['shrug1.cjs', 'shrug2.cjs']);
    mockRequireFn
      .mockReturnValueOnce({
        name: 'shrug',
        description: 'Shrug v1',
        handler: () => ({ content: '¯' }),
      })
      .mockReturnValueOnce({
        name: 'shrug',
        description: 'Shrug v2',
        handler: () => ({ content: '\\_(ツ)_/¯' }),
      });
    loadCommands();
    expect(getCommands()).toHaveLength(2);
    expect(getCommands().filter((c) => c.name === 'shrug')).toHaveLength(2);
  });

  it('reloadCommands re-reads the directory', () => {
    mockReaddirSync.mockReturnValue(['shrug.cjs']);
    mockRequireFn.mockReturnValue({
      name: 'shrug',
      description: 'Shrug',
      handler: () => ({ content: '¯' }),
    });
    reloadCommands();
    expect(getCommands()).toHaveLength(1);

    mockReaddirSync.mockReturnValue([]);
    reloadCommands();
    expect(getCommands()).toHaveLength(0);
  });
});

describe('slashCommands.getCommandsForRole', () => {
  beforeEach(() => {
    mockReaddirSync.mockReturnValue(['a.cjs', 'b.cjs', 'c.cjs']);
    mockRequireFn
      .mockReturnValueOnce({
        name: 'public',
        description: 'Public cmd',
        handler: () => ({ content: '' }),
      })
      .mockReturnValueOnce({
        name: 'admin-only',
        description: 'Admin cmd',
        gate: { applicableRoles: ['Admin'] },
        handler: () => ({ content: '' }),
      })
      .mockReturnValueOnce({
        name: 'mod',
        description: 'Mod cmd',
        gate: { applicableRoles: ['Admin', 'Moderator'] },
        handler: () => ({ content: '' }),
      });
    loadCommands();
  });

  afterEach(() => {
    mockReaddirSync.mockReturnValue([]);
    loadCommands();
  });

  it('returns all commands for Admin', () => {
    const cmds = getCommandsForRole('Admin');
    expect(cmds).toHaveLength(3);
  });

  it('returns public + mod commands for Moderator', () => {
    const cmds = getCommandsForRole('Moderator');
    expect(cmds.map((c) => c.name)).toEqual(expect.arrayContaining(['public', 'mod']));
    expect(cmds.find((c) => c.name === 'admin-only')).toBeUndefined();
  });

  it('returns only public commands for ViewerCompany', () => {
    const cmds = getCommandsForRole('ViewerCompany');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].name).toBe('public');
  });

  it('returns only public commands for ViewerGuest', () => {
    const cmds = getCommandsForRole('ViewerGuest');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].name).toBe('public');
  });

  it('returns name, description, placeholder (no handler/gate)', () => {
    const cmds = getCommandsForRole('Admin');
    for (const cmd of cmds) {
      expect(cmd).not.toHaveProperty('handler');
      expect(cmd).not.toHaveProperty('gate');
      expect(cmd).toHaveProperty('name');
      expect(cmd).toHaveProperty('description');
    }
  });
});

describe('slashCommands.executeCommand', () => {
  const handler = vi.fn();
  const adminHandler = vi.fn();

  beforeEach(() => {
    handler.mockReset();
    adminHandler.mockReset();
    mockReaddirSync.mockReturnValue(['shrug.cjs', 'admin.cjs']);
    mockRequireFn
      .mockReturnValueOnce({
        name: 'shrug',
        description: 'Shrug',
        placeholder: '[message]',
        handler,
      })
      .mockReturnValueOnce({
        name: 'secret',
        description: 'Admin only',
        gate: { applicableRoles: ['Admin'] },
        handler: adminHandler,
      });
    loadCommands();
  });

  afterEach(() => {
    mockReaddirSync.mockReturnValue([]);
    loadCommands();
  });

  it('returns null for non-slash messages', () => {
    const result = executeCommand({
      content: 'hello',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when no matching command found', () => {
    const result = executeCommand({
      content: '/unknown',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when content starts with / but has no command name', () => {
    const result = executeCommand({
      content: '/ ',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(result).toBeNull();
  });

  it('calls handler with correct input (text after command)', () => {
    handler.mockReturnValue({ content: 'hello ¯\\_(ツ)_/¯' });
    executeCommand({
      content: '/shrug hello',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(handler).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ content: '/shrug hello' }),
      expect.objectContaining({ id: 'u1' }),
    );
  });

  it('calls handler with empty input when no text after command', () => {
    handler.mockReturnValue({ content: '¯\\_(ツ)_/¯' });
    executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(handler).toHaveBeenCalledWith('', expect.anything(), expect.anything());
  });

  it('passes SimplifiedMessage with correct fields', () => {
    handler.mockReturnValue({ content: 'ok' });
    executeCommand({
      content: '/shrug hi',
      userId: 'u1',
      userDisplayName: 'Alice',
      userRole: 'ViewerCompany',
      mentionedUserIds: ['u2'],
    });
    const msg = handler.mock.calls[0][1];
    expect(msg.content).toBe('/shrug hi');
    expect(msg.mentionedUserIds).toEqual(['u2']);
    expect(typeof msg.createdAt).toBe('string');
  });

  it('passes SimplifiedUser with correct fields', () => {
    handler.mockReturnValue({ content: 'ok' });
    executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'Alice',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    const user = handler.mock.calls[0][2];
    expect(user).toEqual({ id: 'u1', displayName: 'Alice', role: 'ViewerCompany' });
  });

  it('returns handler result', () => {
    handler.mockReturnValue({ content: 'shrug result' });
    const result = executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(result?.response).toEqual({ content: 'shrug result' });
    expect(result?.authorUserId).toBe(SYSTEM_USER_ID);
  });

  it('returns authorUserId as userId when impersonateUser is true and not ephemeral', () => {
    handler.mockReturnValue({ content: 'impersonated', impersonateUser: true });
    const result = executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(result?.authorUserId).toBe('u1');
  });

  it('returns ephemeral result when handler sets ephemeral: true', () => {
    handler.mockReturnValue({ content: 'Only you', ephemeral: true });
    const result = executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(result?.response).toEqual({ content: 'Only you', ephemeral: true });
    expect(result?.authorUserId).toBe(SYSTEM_USER_ID);
  });

  it('throws FORBIDDEN when user lacks required role', () => {
    expect(() =>
      executeCommand({
        content: '/secret',
        userId: 'u1',
        userDisplayName: 'User',
        userRole: 'ViewerCompany',
        mentionedUserIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', statusCode: 403 }));
  });

  it('does not throw for admin using gated command', () => {
    adminHandler.mockReturnValue({ content: 'shh' });
    expect(() =>
      executeCommand({
        content: '/secret',
        userId: 'u1',
        userDisplayName: 'Admin',
        userRole: 'Admin',
        mentionedUserIds: [],
      }),
    ).not.toThrow();
  });

  it('throws INTERNAL_ERROR when handler throws', () => {
    handler.mockImplementation(() => {
      throw new Error('oops');
    });
    expect(() =>
      executeCommand({
        content: '/shrug',
        userId: 'u1',
        userDisplayName: 'User',
        userRole: 'ViewerCompany',
        mentionedUserIds: [],
      }),
    ).toThrow(expect.objectContaining({ code: 'INTERNAL_ERROR', statusCode: 500 }));
  });

  it('logs warning when command returns both ephemeral and impersonateUser', () => {
    handler.mockReturnValue({ content: 'result', ephemeral: true, impersonateUser: true });
    const result = executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      { command: 'shrug' },
      'Slash command returned both ephemeral and impersonateUser — impersonateUser ignored',
    );
    expect(result?.authorUserId).toBe(SYSTEM_USER_ID);
  });

  it('uses first matching command when duplicates exist', () => {
    const handler2 = vi.fn().mockReturnValue({ content: 'second' });
    mockReaddirSync.mockReturnValue(['s1.cjs', 's2.cjs']);
    mockRequireFn
      .mockReturnValueOnce({ name: 'shrug', description: 'First shrug', handler })
      .mockReturnValueOnce({ name: 'shrug', description: 'Second shrug', handler: handler2 });
    loadCommands();
    handler.mockReturnValue({ content: 'first' });

    executeCommand({
      content: '/shrug',
      userId: 'u1',
      userDisplayName: 'User',
      userRole: 'ViewerCompany',
      mentionedUserIds: [],
    });
    expect(handler).toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runUsersCommand } from './users.js';
import { banUser, unbanUser, updateUserRole } from '../../services/userService.js';
import { Role } from '@manlycam/types';

vi.mock('../../services/userService.js', () => ({
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  updateUserRole: vi.fn(),
}));

describe('users CLI command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls banUser for "ban" action', async () => {
    vi.mocked(banUser).mockResolvedValue({ sessionCount: 2 });
    await runUsersCommand('ban', ['test@example.com']);
    expect(banUser).toHaveBeenCalledWith('test@example.com');
  });

  it('calls unbanUser for "unban" action', async () => {
    await runUsersCommand('unban', ['test@example.com']);
    expect(unbanUser).toHaveBeenCalledWith('test@example.com');
  });

  it('calls updateUserRole for "grant-admin" action', async () => {
    await runUsersCommand('grant-admin', ['--email=admin@example.com']);
    expect(updateUserRole).toHaveBeenCalledWith('admin@example.com', Role.Admin);
  });

  it('calls updateUserRole for "set-role" action', async () => {
    await runUsersCommand('set-role', ['--email=user@example.com', '--role=Moderator']);
    expect(updateUserRole).toHaveBeenCalledWith('user@example.com', Role.Moderator);
  });

  it('throws error for invalid role in "set-role"', async () => {
    await expect(
      runUsersCommand('set-role', ['--email=u@e.com', '--role=Invalid']),
    ).rejects.toThrow('Invalid role');
  });

  it('throws error for missing email in "grant-admin"', async () => {
    await expect(runUsersCommand('grant-admin', [])).rejects.toThrow(
      'Usage: grant-admin --email=<email>',
    );
  });
});

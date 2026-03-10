import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAdminUsers, handleAdminUserUpdate, users as usersRef } from './useAdminUsers';
import type { AdminUser } from './useAdminUsers';
import { apiFetch } from '@/lib/api';
import { Role } from '@manlycam/types';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

describe('useAdminUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usersRef.value = [];
  });

  it('fetches users', async () => {
    const mockUsers = [
      { id: 'u1', email: 'u@e.com', role: Role.ViewerCompany },
    ] as unknown as AdminUser[];
    vi.mocked(apiFetch).mockResolvedValue(mockUsers);

    const { users, isLoading, fetchUsers } = useAdminUsers();

    const promise = fetchUsers();
    expect(isLoading.value).toBe(true);

    await promise;

    expect(users.value).toEqual(mockUsers);
    expect(isLoading.value).toBe(false);
  });

  it('updates user role optimistically', async () => {
    const mockUsers = [
      { id: 'u1', email: 'u@e.com', role: Role.ViewerCompany },
    ] as unknown as AdminUser[];
    usersRef.value = mockUsers;

    const { users, updateRole } = useAdminUsers();

    vi.mocked(apiFetch).mockResolvedValue({ ok: true });
    await updateRole('u1', Role.Moderator);

    expect(users.value[0].role).toBe(Role.Moderator);
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/users/u1/role', expect.any(Object));
  });

  it('does nothing if same role is passed to updateRole', async () => {
    const mockUsers = [{ id: 'u1', email: 'u@e.com', role: Role.ViewerCompany }];
    usersRef.value = mockUsers as unknown as AdminUser[];

    const { updateRole } = useAdminUsers();
    await updateRole('u1', Role.ViewerCompany);

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('handles user update from WS', async () => {
    const mockUsers = [
      { id: 'u1', email: 'u@e.com', role: Role.ViewerCompany },
    ] as unknown as AdminUser[];
    usersRef.value = mockUsers;

    const { users } = useAdminUsers();

    handleAdminUserUpdate({ id: 'u1', role: Role.Admin });
    expect(users.value[0].role).toBe(Role.Admin);
  });

  it('ignores user update from WS if user not in list', async () => {
    const mockUsers = [
      { id: 'u1', email: 'u@e.com', role: Role.ViewerCompany },
    ] as unknown as AdminUser[];
    usersRef.value = mockUsers;

    handleAdminUserUpdate({ id: 'u99', role: Role.Admin });
    expect(usersRef.value[0].role).toBe(Role.ViewerCompany);
  });

  it('sets error on fetch failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Fetch failed'));

    const { error, fetchUsers } = useAdminUsers();
    await fetchUsers();

    expect(error.value).toBe('Fetch failed');
  });

  it('throws error on updateRole failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Update failed'));
    const { updateRole } = useAdminUsers();

    await expect(updateRole('u1', Role.Moderator)).rejects.toThrow('Update failed');
  });
});

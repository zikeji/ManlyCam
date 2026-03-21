import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useAdminUsers, handleAdminUserUpdate, users as usersRef } from './useAdminUsers';
import type { AdminUser } from './useAdminUsers';
import { apiFetch } from '@/lib/api';
import { Role } from '@manlycam/types';

vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

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

  it('updates user role optimistically and shows toast', async () => {
    const { toast } = await import('vue-sonner');
    const mockUsers = [
      { id: 'u1', email: 'u@e.com', role: Role.ViewerCompany },
    ] as unknown as AdminUser[];
    usersRef.value = mockUsers;

    const { users, updateRole } = useAdminUsers();

    vi.mocked(apiFetch).mockResolvedValue({ ok: true });
    await updateRole('u1', Role.Moderator);

    expect(users.value[0].role).toBe(Role.Moderator);
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/users/u1/role', expect.any(Object));
    expect(toast.success).toHaveBeenCalledWith('Role updated');
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

  it('derives userTagText/userTagColor from userTag field on WS update', () => {
    usersRef.value = [
      {
        id: 'u1',
        email: 'u@e.com',
        role: Role.ViewerCompany,
        userTagText: null,
        userTagColor: null,
      },
    ] as unknown as AdminUser[];

    handleAdminUserUpdate({ id: 'u1', userTag: { text: 'VIP', color: '#ef4444' } } as never);

    expect(usersRef.value[0].userTagText).toBe('VIP');
    expect(usersRef.value[0].userTagColor).toBe('#ef4444');
  });

  it('clears userTagText/userTagColor when userTag is null in WS update', () => {
    usersRef.value = [
      {
        id: 'u1',
        email: 'u@e.com',
        role: Role.ViewerCompany,
        userTagText: 'VIP',
        userTagColor: '#ef4444',
      },
    ] as unknown as AdminUser[];

    handleAdminUserUpdate({ id: 'u1', userTag: null } as never);

    expect(usersRef.value[0].userTagText).toBeNull();
    expect(usersRef.value[0].userTagColor).toBeNull();
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

  it('sets fallback error message when thrown error has no message', async () => {
    vi.mocked(apiFetch).mockRejectedValue({});

    const { error, fetchUsers } = useAdminUsers();
    await fetchUsers();

    expect(error.value).toBe('Failed to fetch users');
  });

  it('throws error on updateRole failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Update failed'));
    const { updateRole } = useAdminUsers();

    await expect(updateRole('u1', Role.Moderator)).rejects.toThrow('Update failed');
  });

  describe('updateUserTag', () => {
    it('calls PATCH user-tag endpoint and updates optimistically', async () => {
      const mockUser = {
        id: 'u1',
        email: 'u@e.com',
        role: Role.ViewerCompany,
        userTagText: null,
        userTagColor: null,
      } as unknown as AdminUser;
      usersRef.value = [mockUser];

      vi.mocked(apiFetch).mockResolvedValue(undefined);

      const { users, updateUserTag } = useAdminUsers();
      await updateUserTag('u1', 'VIP', '#ef4444');

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/admin/users/u1/user-tag',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(users.value[0].userTagText).toBe('VIP');
      expect(users.value[0].userTagColor).toBe('#ef4444');
    });

    it('throws error on updateUserTag failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Tag update failed'));
      const { updateUserTag } = useAdminUsers();

      await expect(updateUserTag('u1', 'VIP', '#ef4444')).rejects.toThrow('Tag update failed');
    });
  });

  describe('clearUserTag', () => {
    it('calls PATCH user-tag with empty text and clears optimistically', async () => {
      const mockUser = {
        id: 'u1',
        email: 'u@e.com',
        role: Role.ViewerCompany,
        userTagText: 'VIP',
        userTagColor: '#ef4444',
      } as unknown as AdminUser;
      usersRef.value = [mockUser];

      vi.mocked(apiFetch).mockResolvedValue(undefined);

      const { users, clearUserTag } = useAdminUsers();
      await clearUserTag('u1');

      expect(apiFetch).toHaveBeenCalledWith(
        '/api/admin/users/u1/user-tag',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ userTagText: '' }),
        }),
      );
      expect(users.value[0].userTagText).toBeNull();
      expect(users.value[0].userTagColor).toBeNull();
    });

    it('throws error on clearUserTag failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Clear failed'));
      const { clearUserTag } = useAdminUsers();

      await expect(clearUserTag('u1')).rejects.toThrow('Clear failed');
    });
  });

  describe('no auto-fetch on composable init', () => {
    it('does not call fetchUsers on composable init', () => {
      usersRef.value = [];
      const TestComponent = defineComponent({
        setup() {
          useAdminUsers();
          return {};
        },
        template: '<div/>',
      });

      mount(TestComponent);

      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('banUserById', () => {
    it('calls DELETE /api/users/:id/ban and updates bannedAt on success', async () => {
      const mockUser = { id: 'u1', email: 'u@e.com', role: Role.ViewerCompany, bannedAt: null };
      usersRef.value = [mockUser] as unknown as AdminUser[];

      vi.mocked(apiFetch).mockResolvedValue(undefined);

      const { users, banUserById } = useAdminUsers();
      await banUserById('u1');

      expect(apiFetch).toHaveBeenCalledWith('/api/users/u1/ban', { method: 'DELETE' });
      expect(users.value[0].bannedAt).not.toBeNull();
    });

    it('calls toast.error on banUserById failure', async () => {
      const { toast } = await import('vue-sonner');
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));
      const { banUserById } = useAdminUsers();

      await banUserById('u1');

      expect(toast.error).toHaveBeenCalledWith('Failed to ban user');
    });
  });

  describe('unbanUserById', () => {
    it('calls POST /api/users/:id/unban and clears bannedAt on success', async () => {
      const mockUser = {
        id: 'u1',
        email: 'u@e.com',
        role: Role.ViewerCompany,
        bannedAt: '2026-01-01T00:00:00Z',
      };
      usersRef.value = [mockUser] as unknown as AdminUser[];

      vi.mocked(apiFetch).mockResolvedValue(undefined);

      const { users, unbanUserById } = useAdminUsers();
      await unbanUserById('u1');

      expect(apiFetch).toHaveBeenCalledWith('/api/users/u1/unban', { method: 'POST' });
      expect(users.value[0].bannedAt).toBeNull();
    });

    it('calls toast.error on unbanUserById failure', async () => {
      const { toast } = await import('vue-sonner');
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));
      const { unbanUserById } = useAdminUsers();

      await unbanUserById('u1');

      expect(toast.error).toHaveBeenCalledWith('Failed to unban user');
    });
  });
});

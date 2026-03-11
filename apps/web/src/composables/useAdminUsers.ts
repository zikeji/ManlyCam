import { ref, onMounted } from 'vue';
import { apiFetch } from '@/lib/api';
import { Role } from '@manlycam/types';
import type { UserProfile } from '@manlycam/types';

export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  bannedAt: string | null;
  mutedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string | null;
  userTagText: string | null;
  userTagColor: string | null;
}

export const users = ref<AdminUser[]>([]);

export function handleAdminUserUpdate(updatedUser: Partial<UserProfile> & { id: string }) {
  const index = users.value.findIndex((u) => u.id === updatedUser.id);
  if (index !== -1) {
    // Derive userTagText/userTagColor from userTag when the WS payload arrives
    // (UserProfile carries userTag:{text,color} but AdminUser stores them as flat fields)
    const tagFields =
      'userTag' in updatedUser
        ? {
            userTagText: updatedUser.userTag?.text ?? null,
            userTagColor: updatedUser.userTag?.color ?? null,
          }
        : {};
    users.value[index] = {
      ...users.value[index],
      ...(updatedUser as unknown as Partial<AdminUser>),
      ...tagFields,
    };
  }
}

export function useAdminUsers() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchUsers = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<AdminUser[]>('/api/admin/users');
      users.value = data;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch users';
    } finally {
      isLoading.value = false;
    }
  };

  const updateRole = async (userId: string, role: Role) => {
    const user = users.value.find((u) => u.id === userId);
    if (user && user.role === role) return;

    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      // Optimistic update
      handleAdminUserUpdate({ id: userId, role });
    } catch (err: unknown) {
      console.error('Failed to update role:', err);
      throw err;
    }
  };

  const updateUserTag = async (userId: string, userTagText: string, userTagColor: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/user-tag`, {
        method: 'PATCH',
        body: JSON.stringify({ userTagText, userTagColor }),
      });
      // Optimistic update
      handleAdminUserUpdate({ id: userId, userTagText, userTagColor } as never);
    } catch (err: unknown) {
      console.error('Failed to update user tag:', err);
      throw err;
    }
  };

  const clearUserTag = async (userId: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/user-tag`, {
        method: 'PATCH',
        body: JSON.stringify({ userTagText: '' }),
      });
      // Optimistic update
      handleAdminUserUpdate({ id: userId, userTagText: null, userTagColor: null } as never);
    } catch (err: unknown) {
      console.error('Failed to clear user tag:', err);
      throw err;
    }
  };

  onMounted(() => {
    if (users.value.length === 0) {
      fetchUsers();
    }
  });

  return {
    users,
    isLoading,
    error,
    fetchUsers,
    updateRole,
    updateUserTag,
    clearUserTag,
  };
}

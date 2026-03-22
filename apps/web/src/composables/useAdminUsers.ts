import { ref, onUnmounted } from 'vue';
import { toast } from 'vue-sonner';
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

    const currentUser = users.value[index];
    const mergedUser = {
      ...currentUser,
      ...(updatedUser as unknown as Partial<AdminUser>),
      ...tagFields,
    };

    // Only update if data actually changed (shallow comparison)
    const hasChanged = Object.keys(mergedUser).some(
      (key) =>
        (mergedUser as Record<string, unknown>)[key] !==
        (currentUser as Record<string, unknown>)[key],
    );
    if (!hasChanged) return;

    const updated = users.value.slice();
    updated[index] = mergedUser;
    users.value = updated;
  }
}

export function useAdminUsers() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const abortController = ref<AbortController | null>(null);

  const fetchUsers = async () => {
    // Cancel any pending request
    if (abortController.value) {
      abortController.value.abort();
    }
    abortController.value = new AbortController();

    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<AdminUser[]>('/api/admin/users', {
        signal: abortController.value.signal,
      });
      users.value = data;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Silently ignore abort errors
      }
      error.value = (err as Error).message || 'Failed to fetch users';
    } finally {
      isLoading.value = false;
      abortController.value = null;
    }
  };

  onUnmounted(() => {
    if (abortController.value) {
      abortController.value.abort();
    }
  });

  const updateRole = async (userId: string, role: Role) => {
    const user = users.value.find((u) => u.id === userId);
    if (user && user.role === role) return;

    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      handleAdminUserUpdate({ id: userId, role });
      toast.success('Role updated');
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

  const banUserById = async (userId: string) => {
    try {
      await apiFetch(`/api/users/${userId}/ban`, { method: 'DELETE' });
      handleAdminUserUpdate({ id: userId, bannedAt: new Date().toISOString() } as never);
      toast.success('User banned');
    } catch (err: unknown) {
      console.error('Failed to ban user:', err);
      toast.error('Failed to ban user');
    }
  };

  const unbanUserById = async (userId: string) => {
    try {
      await apiFetch(`/api/users/${userId}/unban`, { method: 'POST' });
      handleAdminUserUpdate({ id: userId, bannedAt: null } as never);
      toast.success('User unbanned');
    } catch (err: unknown) {
      console.error('Failed to unban user:', err);
      const message = err instanceof Error ? err.message : 'Failed to unban user';
      toast.error(message);
    }
  };

  return {
    users,
    isLoading,
    error,
    fetchUsers,
    updateRole,
    updateUserTag,
    clearUserTag,
    banUserById,
    unbanUserById,
  };
}

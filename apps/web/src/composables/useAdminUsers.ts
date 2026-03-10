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
}

export const users = ref<AdminUser[]>([]);

export function handleAdminUserUpdate(updatedUser: Partial<UserProfile> & { id: string }) {
  const index = users.value.findIndex((u) => u.id === updatedUser.id);
  if (index !== -1) {
    users.value[index] = {
      ...users.value[index],
      ...(updatedUser as unknown as Partial<AdminUser>),
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
  };
}

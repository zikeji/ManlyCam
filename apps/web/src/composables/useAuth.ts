import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { MeResponse } from '@manlycam/types';
import { apiFetch } from '@/lib/api';

const user = ref<MeResponse | null>(null);

export const useAuth = () => {
  const router = useRouter();

  const fetchCurrentUser = async (): Promise<void> => {
    try {
      user.value = await apiFetch<MeResponse>('/api/me');
    } catch {
      user.value = null;
    }
  };

  const logout = async (): Promise<void> => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    user.value = null;
    await router.push('/');
  };

  return { user, fetchCurrentUser, logout };
};

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { MeResponse } from '@manlycam/types';
import { apiFetch, ApiFetchError } from '@/lib/api';

/**
 * Module-level global auth state
 * This is intentional: all uses of useAuth() share the same user ref.
 * This pattern is correct for app-wide authentication state that needs
 * to be shared across multiple components. Tests use vi.resetModules()
 * to isolate each test's state.
 */
const user = ref<MeResponse | null>(null);

export const useAuth = () => {
  const router = useRouter();

  const fetchCurrentUser = async (): Promise<void> => {
    try {
      user.value = await apiFetch<MeResponse>('/api/me');
    } catch (err) {
      // Distinguish between auth errors (401) and network errors
      const isAuthError = err instanceof ApiFetchError && err.code === 'UNAUTHORIZED';
      if (isAuthError) {
        user.value = null;
      } else {
        console.warn('Failed to fetch user:', err);
      }
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Logout failed with status ${res.status}`);
      }
    } catch (err) {
      console.error('Logout failed:', err);
      // Note: In a real app, would use a toast notification system
      // For now, log the error and return early to prevent logout
      return;
    }
    user.value = null;
    // Lazy import to avoid test environment issues (window undefined)
    const { invalidateRouterCache } = await import('@/router');
    invalidateRouterCache();
    await router.push('/');
  };

  return { user, fetchCurrentUser, logout };
};

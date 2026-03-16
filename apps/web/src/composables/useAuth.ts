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
export const user = ref<MeResponse | null>(null);
export const authLoading = ref(true);
let _fetchPromise: Promise<void> | null = null;

/**
 * Fetch the current user once. Subsequent calls while the fetch is in flight
 * return the same promise (dedup). Once loaded (authLoading === false), this
 * is a no-op — call again by resetting authLoading to true first (e.g. after logout).
 */
export async function fetchCurrentUser(): Promise<void> {
  if (!authLoading.value) return; // Already loaded — skip
  if (_fetchPromise !== null) return _fetchPromise; // In-flight — join existing request
  _fetchPromise = (async () => {
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
    } finally {
      authLoading.value = false;
      _fetchPromise = null;
    }
  })();
  return _fetchPromise;
}

export const useAuth = () => {
  const router = useRouter();

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
    authLoading.value = true; // Reset so the next fetchCurrentUser() re-fetches
    // Lazy import to avoid test environment issues (window undefined)
    const { invalidateRouterCache } = await import('@/router');
    invalidateRouterCache();
    await router.push('/');
  };

  return { user, authLoading, fetchCurrentUser, logout };
};

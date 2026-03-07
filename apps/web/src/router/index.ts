import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '@/views/LoginView.vue';
import RejectedView from '@/views/RejectedView.vue';
import BannedView from '@/views/BannedView.vue';

interface UserState {
  bannedAt: string | null;
  role: string;
}

interface ErrorBody {
  error?: { code?: string };
}

// Cache user state to avoid fetching on every navigation
let cachedUser: UserState | null | undefined;
let cacheInvalid = false;

// Public function to invalidate cache (called by useAuth on logout)
export function invalidateRouterCache(): void {
  cacheInvalid = true;
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LoginView }, // App.vue switches to WatchView when authenticated
    { path: '/rejected', component: RejectedView },
    { path: '/banned', component: BannedView },
  ],
});

router.beforeEach(async (to) => {
  if (to.path === '/rejected' || to.path === '/banned') return true;

  // Check if cache was invalidated (e.g., after logout)
  if (cacheInvalid) {
    cachedUser = undefined;
    cacheInvalid = false;
  }

  // Use cached user state if available
  if (cachedUser !== undefined) {
    if (cachedUser?.bannedAt) return '/banned';
    if (cachedUser?.role === 'pending') return '/rejected';
    return true;
  }

  // Fetch user only if not cached
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      cachedUser = (await res.json()) as UserState;
      if (cachedUser.bannedAt) return '/banned';
      if (cachedUser.role === 'pending') return '/rejected';
      return true;
    }

    const body = (await res.json().catch((err) => {
      console.warn('Failed to parse error response:', err);
      return {};
    })) as ErrorBody;
    if (body?.error?.code === 'BANNED') {
      cachedUser = null;
      return '/banned';
    }
    cachedUser = null;
  } catch (err) {
    console.warn('Failed to fetch user state:', err);
    // On network error, allow navigation to show LoginView
    cachedUser = null;
  }
  return true; // no session — App.vue renders LoginView
});

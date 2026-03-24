import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '@/views/LoginView.vue';
import RejectedView from '@/views/RejectedView.vue';
import BannedView from '@/views/BannedView.vue';
import MyClipsView from '@/views/MyClipsView.vue';
import { user, authLoading, fetchCurrentUser } from '@/composables/useAuth';

// Called by useAuth.logout() to signal that auth state has been invalidated.
// authLoading is reset to true in logout(), so the next navigation re-fetches.
export function invalidateRouterCache(): void {
  // no-op — authLoading reset in useAuth handles the re-fetch trigger
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LoginView }, // App.vue switches to WatchView when authenticated
    { path: '/rejected', component: RejectedView },
    { path: '/banned', component: BannedView },
    { path: '/clips', component: MyClipsView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  if (to.path === '/rejected' || to.path === '/banned') return true;

  // Fetch user if not yet loaded (authLoading resets to true after logout)
  if (authLoading.value) {
    await fetchCurrentUser();
  }

  if (user.value?.bannedAt) return '/banned';

  if (to.meta.requiresAuth && !user.value) return '/';
  return true;
});

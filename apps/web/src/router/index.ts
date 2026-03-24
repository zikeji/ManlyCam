import { createRouter, createWebHistory } from 'vue-router';
import { defineComponent } from 'vue';
import LoginView from '@/views/LoginView.vue';
import RejectedView from '@/views/RejectedView.vue';
import BannedView from '@/views/BannedView.vue';
import { user, authLoading, fetchCurrentUser } from '@/composables/useAuth';

// Called by useAuth.logout() to signal that auth state has been invalidated.
// authLoading is reset to true in logout(), so the next navigation re-fetches.
export function invalidateRouterCache(): void {
  // no-op — authLoading reset in useAuth handles the re-fetch trigger
}

// Placeholder for standalone clip page — Story 10-6 implements the full page.
// When accessed via history.pushState modal, $route.path doesn't change (pushState bypasses
// Vue Router), so this component only renders on direct navigation or page refresh.
const ClipStandalonePage = defineComponent({
  template: `<div class="flex items-center justify-center h-dvh bg-[hsl(var(--background))] text-muted-foreground text-sm">
    Clip page coming soon
  </div>`,
});

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LoginView }, // App.vue switches to WatchView when authenticated
    { path: '/rejected', component: RejectedView },
    { path: '/banned', component: BannedView },
    { path: '/clips/:id', component: ClipStandalonePage },
  ],
});

router.beforeEach(async (to) => {
  if (to.path === '/rejected' || to.path === '/banned') return true;
  if (to.path.startsWith('/clips/')) return true;

  // Fetch user if not yet loaded (authLoading resets to true after logout)
  if (authLoading.value) {
    await fetchCurrentUser();
  }

  if (user.value?.bannedAt) return '/banned';

  return true;
});

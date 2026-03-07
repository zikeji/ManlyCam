import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '@/views/LoginView.vue';
import RejectedView from '@/views/RejectedView.vue';
import BannedView from '@/views/BannedView.vue';

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

  const res = await fetch('/api/me', { credentials: 'include' });
  if (res.ok) {
    const user = (await res.json()) as { bannedAt: string | null; role: string };
    if (user.bannedAt) return '/banned';
    if (user.role === 'pending') return '/rejected';
    return true; // approved — App.vue renders WatchView via useAuth state
  }

  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
  if (body?.error?.code === 'BANNED') return '/banned';
  return true; // no session — App.vue renders LoginView
});

import { mount, VueWrapper } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App.vue';
import { useAuth } from '@/composables/useAuth';
import { useWebSocket } from '@/composables/useWebSocket';
import { ref } from 'vue';

vi.mock('@/composables/useAuth');
vi.mock('@/composables/useWebSocket');
vi.mock('vue-router', () => ({
  RouterView: { template: '<div data-testid="router-view"></div>' },
  useRoute: () => ({ path: '/' }),
  createRouter: () => ({ beforeEach: vi.fn() }),
  createWebHistory: vi.fn(),
}));
vi.mock('@/views/LoginView.vue', () => ({
  default: { template: '<div data-testid="login-view"></div>' },
}));
vi.mock('@/views/WatchView.vue', () => ({
  default: { template: '<div data-testid="watch-view"></div>' },
}));
vi.mock('@/components/ui/sonner', () => ({
  Toaster: { template: '<div data-testid="toaster"></div>' },
}));

describe('App.vue', () => {
  let wrapper: VueWrapper | null = null;
  let mockUser: ReturnType<typeof ref<Record<string, unknown> | null>>;
  let mockAuthLoading: ReturnType<typeof ref<boolean>>;
  let mockFetchCurrentUser: ReturnType<typeof vi.fn>;
  let mockWsConnect: ReturnType<typeof vi.fn>;
  let mockWsDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUser = ref(null);
    mockAuthLoading = ref(false);
    mockFetchCurrentUser = vi.fn();
    mockWsConnect = vi.fn();
    mockWsDisconnect = vi.fn();

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      authLoading: mockAuthLoading,
      fetchCurrentUser: mockFetchCurrentUser,
    } as never);

    vi.mocked(useWebSocket).mockReturnValue({
      connect: mockWsConnect,
      disconnect: mockWsDisconnect,
    } as never);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.clearAllMocks();
  });

  const createWrapper = (routePath = '/') => {
    return mount(App, {
      global: {
        mocks: {
          $route: { path: routePath },
        },
        stubs: {
          RouterView: true,
          WatchView: true,
          LoginView: true,
          Toaster: true,
        },
      },
    });
  };

  it('fetches current user on mount', () => {
    wrapper = createWrapper();
    expect(mockFetchCurrentUser).toHaveBeenCalled();
  });

  it('shows loading spinner when authLoading is true', () => {
    mockAuthLoading.value = true;
    wrapper = createWrapper();
    expect(wrapper.find('[data-auth-loading]').exists()).toBe(true);
  });

  it('shows LoginView when user is null and not loading', () => {
    mockUser.value = null;
    mockAuthLoading.value = false;
    wrapper = createWrapper();
    expect(wrapper.findComponent({ name: 'LoginView' }).exists()).toBe(true);
  });

  it('shows WatchView when user is authenticated and route is /', () => {
    mockUser.value = { id: '1', name: 'Test User' };
    mockAuthLoading.value = false;
    wrapper = createWrapper();
    expect(wrapper.findComponent({ name: 'WatchView' }).exists()).toBe(true);
  });

  it('shows RouterView when route is not /', () => {
    wrapper = createWrapper('/other');
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true);
  });

  it('connects websocket when user becomes authenticated', async () => {
    wrapper = createWrapper();
    expect(mockWsConnect).not.toHaveBeenCalled();

    mockUser.value = { id: '1', name: 'Test User' };
    await wrapper.vm.$nextTick();

    expect(mockWsConnect).toHaveBeenCalled();
  });

  it('disconnects websocket when user is cleared', async () => {
    mockUser.value = { id: '1', name: 'Test User' };
    wrapper = createWrapper();

    mockUser.value = null;
    await wrapper.vm.$nextTick();

    expect(mockWsDisconnect).toHaveBeenCalled();
  });
});

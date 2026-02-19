import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRouter, createMemoryHistory } from 'vue-router';

const mockUseAuthStore = vi.fn();

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

describe('Router guards', () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false });
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'login', component: { template: 'Login' }, meta: { guest: true } },
        {
          path: '/dashboard',
          name: 'dashboard',
          component: { template: 'Dash' },
          meta: { requiresAuth: true },
        },
      ],
    });
    router.beforeEach((to) => {
      const auth = mockUseAuthStore();
      if (to.meta.requiresAuth && !auth?.isAuthenticated) return { name: 'login' };
      if (to.meta.guest && auth?.isAuthenticated) return { name: 'dashboard' };
      return;
    });
    await router.push('/login');
  });

  it('should redirect to login when unauthenticated and visiting protected route', async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: false });
    await router.push('/dashboard');
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('should allow access to protected route when authenticated', async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true });
    await router.push('/dashboard');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('should redirect to dashboard when authenticated and visiting guest route', async () => {
    mockUseAuthStore.mockReturnValue({ isAuthenticated: true });
    await router.push('/dashboard');
    expect(router.currentRoute.value.name).toBe('dashboard');
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });
});

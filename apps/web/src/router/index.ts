import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/2fa/verify',
      name: '2fa-verify',
      component: () => import('../views/TotpVerifyView.vue'),
    },
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/keys',
      name: 'keys',
      component: () => import('../views/KeysView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/connections',
      name: 'connections',
      component: () => import('../views/ConnectionsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/connections/:id',
      name: 'connection-detail',
      component: () => import('../views/ConnectionDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/connections/:id/logs',
      name: 'connection-logs',
      component: () => import('../views/ConnectionLogsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/profile',
      name: 'settings-profile',
      component: () => import('../views/SettingsProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/relays',
      name: 'settings-relays',
      component: () => import('../views/SettingsRelaysView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/security',
      name: 'settings-security',
      component: () => import('../views/SettingsSecurityView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/general',
      name: 'settings-general',
      component: () => import('../views/SettingsGeneralView.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login' };
  }
  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  return;
});

export { router };

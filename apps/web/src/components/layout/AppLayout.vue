<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@nanostores/vue';
import {
  LayoutDashboard,
  Key,
  Link2,
  Radio,
  Shield,
  SlidersHorizontal,
  PanelLeft,
  Menu,
} from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { useUiStore, $ui } from '@/stores/ui';
import { useSettingsStore } from '@/stores/settings';
import Button from '@/components/ui/Button.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const uiState = useStore($ui);
const settingsStore = useSettingsStore();
const mobileMenuOpen = ref(false);

onMounted(() => {
  auth.refetchProfileIfMissing();
});

const showLayout = computed(() => {
  const guestRoutes = ['login', 'register', '2fa-verify'];
  return !guestRoutes.includes(route.name as string);
});

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Keys', path: '/keys', icon: Key },
  { name: 'Connections', path: '/connections', icon: Link2 },
  { name: 'Relays', path: '/settings/relays', icon: Radio },
  { name: 'Security', path: '/settings/security', icon: Shield },
  { name: 'Settings', path: '/settings/general', icon: SlidersHorizontal },
];

function handleLogout() {
  auth.logout();
  settingsStore.clear();
  router.push('/login');
}
</script>

<template>
  <div v-if="!showLayout" class="min-h-screen flex items-center justify-center bg-background">
    <slot />
  </div>

  <div v-else class="min-h-screen flex bg-background">
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border transition-all duration-300',
        uiState.sidebarCollapsed ? 'w-16' : 'w-64',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <div class="flex items-center gap-2 h-16 px-4 border-b border-border shrink-0">
        <img src="/logo.png" alt="Bunker46" class="w-8 h-8 rounded-lg object-contain shrink-0" />
        <span v-if="!uiState.sidebarCollapsed" class="font-semibold text-lg truncate"
          >Bunker46</span
        >
        <button
          v-if="!uiState.sidebarCollapsed"
          type="button"
          class="ml-auto hidden lg:flex p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer shrink-0"
          title="Collapse sidebar"
          @click="ui.toggleSidebar()"
        >
          <PanelLeft class="w-5 h-5" />
        </button>
      </div>

      <nav class="flex-1 p-3 space-y-1 overflow-y-auto min-h-0">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            route.path.startsWith(item.path)
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          ]"
          @click="mobileMenuOpen = false"
        >
          <component :is="item.icon" class="w-5 h-5 shrink-0" />
          <span v-if="!uiState.sidebarCollapsed">{{ item.name }}</span>
        </router-link>
      </nav>

      <div
        v-if="uiState.sidebarCollapsed"
        class="hidden lg:block p-3 border-t border-border shrink-0"
      >
        <button
          type="button"
          class="flex items-center justify-center w-full p-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          title="Expand sidebar"
          @click="ui.toggleSidebar()"
        >
          <PanelLeft class="w-5 h-5" />
        </button>
      </div>
    </aside>

    <div
      v-if="mobileMenuOpen"
      class="fixed inset-0 bg-black/50 z-40 lg:hidden"
      @click="mobileMenuOpen = false"
    />

    <div
      class="flex-1 flex flex-col min-w-0 min-h-screen transition-[margin] duration-300"
      :class="uiState.sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'"
    >
      <header
        class="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 border-b border-border bg-card/80 backdrop-blur-sm"
      >
        <button
          class="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground cursor-pointer"
          @click="mobileMenuOpen = !mobileMenuOpen"
        >
          <Menu class="w-6 h-6" />
        </button>

        <div class="flex-1" />

        <div class="flex items-center gap-3">
          <span v-if="auth.user" class="text-sm text-muted-foreground hidden sm:block">
            {{ auth.user.username }}
          </span>
          <Button variant="ghost" size="sm" @click="handleLogout"> Logout </Button>
        </div>
      </header>

      <main class="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
        <slot />
      </main>
    </div>
  </div>
</template>

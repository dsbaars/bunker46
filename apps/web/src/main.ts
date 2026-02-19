import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router/index.js';
import { useAuthStore } from './stores/auth.js';
import { useUiStore } from './stores/ui.js';
import './assets/main.css';

async function bootstrap() {
  const auth = useAuthStore();
  const ui = useUiStore();
  await Promise.all([auth.restore(), ui.restore()]);

  const app = createApp(App);
  app.use(router);
  app.mount('#app');
}

bootstrap();

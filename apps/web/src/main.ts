import { createApp } from 'vue';
import { router } from './router/index.ts';
import App from './App.vue';
import './assets/main.css';
import 'vue-sonner/style.css';

const app = createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  console.error('[ManlyCam] Vue error:', info, err);
};

app.use(router).mount('#app');

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'flag-icons/css/flag-icons.min.css';
import './style.css';
import App from './App.vue';
import router from './router/index.js';
import { i18n } from './i18n/index.js';

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app');

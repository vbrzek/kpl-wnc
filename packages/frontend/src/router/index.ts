import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    {
      path: '/room/:token',
      component: () => import('../views/RoomView.vue'),
    },
    {
      path: '/privacy',
      component: () => import('../views/PrivacyView.vue'),
      meta: { public: true },
    },
    {
      path: '/terms-of-service',
      component: () => import('../views/TermsView.vue'),
      meta: { public: true },
    },
  ],
});

export default router;

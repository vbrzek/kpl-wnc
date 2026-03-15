import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { useProfileStore } from '../stores/profileStore';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    {
      path: '/room/:token',
      component: () => import('../views/RoomView.vue'),
    },
    {
      path: '/editor',
      component: () => import('../views/EditorDashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/editor/new',
      component: () => import('../views/EditorWizardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/editor/cards',
      component: () => import('../views/EditorCardsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/editor/:id',
      component: () => import('../views/EditorSetView.vue'),
      meta: { requiresAuth: true },
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
    {
      path: '/rules',
      component: () => import('../views/RulesView.vue'),
      meta: { public: true },
    },
    {
      path: '/about',
      component: () => import('../views/AboutView.vue'),
      meta: { public: true },
    },
    {
      path: '/friends',
      component: () => import('../views/FriendsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/add-friend/:userId',
      component: () => import('../views/AddFriendView.vue'),
      meta: { public: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const profileStore = useProfileStore();
    await profileStore.init();
    if (!profileStore.isAuthenticated) return '/';
  }
});

export default router;

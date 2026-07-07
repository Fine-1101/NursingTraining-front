import { createRouter, createWebHistory } from 'vue-router'
import { hasToken } from '@/services/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach((to) => {
  const authenticated = hasToken()
  if (to.meta.requiresAuth && !authenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.guestOnly && authenticated) return { name: 'dashboard' }
})

export default router

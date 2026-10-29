import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import DefaultLayout from '@/layouts/DefaultLayout.vue'

const routes = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      // ambient:false —— 首页自带那面很大的 hero 照片墙，再叠一层全屏背景墙
      // 就是同一批图铺两遍，很乱，所以首页不要背景墙
      {
        path: '',
        name: 'home',
        component: () => import('@/views/HomeView.vue'),
        // darkNav：首页以黑场开场，导航栏跟着变黑玻璃，避免白条把画面割断
        meta: { ambient: false, darkNav: true },
      },
      { path: 'c/:slug', name: 'category', component: () => import('@/views/CategoryView.vue'), meta: { ambientDim: 0.14 } },
      { path: 'tag/:slug', name: 'tag', component: () => import('@/views/TagView.vue'), meta: { ambientDim: 0.14 } },
      { path: 'search', name: 'search', component: () => import('@/views/SearchView.vue'), meta: { ambientDim: 0.14 } },
      // 深色沉浸：详情页只服务「看图」这一件事，关掉背景墙与页脚，
      // 让照片落在纯黑底上，对比最强
      {
        path: 'photo/:id',
        name: 'photo',
        component: () => import('@/views/ImageDetailView.vue'),
        meta: { immersive: true, dark: true, ambientDim: 0.08 },
      },
      { path: 'u/:username', name: 'user', component: () => import('@/views/UserProfileView.vue'), meta: { ambientDim: 0.14 } },
      { path: 'dev-preview', name: 'dev-preview', component: () => import('@/views/DevPreviewView.vue') },

      {
        path: 'upload',
        name: 'upload',
        component: () => import('@/views/me/UploadView.vue'),
        meta: { requiresAuth: true, title: 'Upload', ambientDim: 0.12 },
      },
      {
        path: 'me/uploads',
        name: 'my-uploads',
        component: () => import('@/views/me/UploadsView.vue'),
        meta: { requiresAuth: true, title: 'My uploads', ambientDim: 0.1 },
      },
      {
        path: 'me/favorites',
        name: 'my-favorites',
        component: () => import('@/views/me/FavoritesView.vue'),
        meta: { requiresAuth: true, title: 'Saved', ambientDim: 0.1 },
      },
      {
        path: 'me/messages',
        name: 'my-messages',
        component: () => import('@/views/me/MessagesView.vue'),
        meta: { requiresAuth: true, title: 'Messages', ambientDim: 0.1 },
      },
      {
        path: 'me/blocks',
        name: 'my-blocks',
        component: () => import('@/views/me/BlocksView.vue'),
        meta: { requiresAuth: true, title: 'Blocked users', ambientDim: 0.1 },
      },
      {
        path: 'me/settings',
        name: 'my-settings',
        component: () => import('@/views/me/SettingsView.vue'),
        meta: { requiresAuth: true, title: 'Settings', ambientDim: 0.1 },
      },

      // 登录/注册也走 DefaultLayout，保证全站导航栏完全一致。
      // immersive：页面自带全屏背景，不渲染页脚。
      // 两条路由共用一个 AuthView：切换时组件不会重建，卡片才能原地做
      // 交叉淡入 + 高度缓动，而不是像换页那样闪一下
      {
        path: 'login',
        name: 'login',
        component: () => import('@/views/AuthView.vue'),
        // darkNav：登录页底改成黑场剧照，导航栏也要跟着变黑玻璃
        meta: { guestOnly: true, immersive: true, darkNav: true, title: 'Sign in' },
      },
      {
        path: 'register',
        name: 'register',
        component: () => import('@/views/AuthView.vue'),
        meta: { guestOnly: true, immersive: true, darkNav: true, title: 'Create account' },
      },
    ],
  },

  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    // 后台表格密集，3D 底几乎关掉：只留极弱的空气感，不干扰读数
    meta: { requiresAuth: true, requiresAdmin: true, ambientDim: 0.06 },
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/DashboardView.vue'), meta: { title: 'Overview' } },
      { path: 'audit', name: 'admin-audit', component: () => import('@/views/admin/AuditView.vue'), meta: { title: 'Audit queue' } },
      { path: 'images', name: 'admin-images', component: () => import('@/views/admin/ImagesView.vue'), meta: { title: 'Images' } },
      { path: 'users', name: 'admin-users', component: () => import('@/views/admin/UsersView.vue'), meta: { title: 'Users' } },
      { path: 'categories', name: 'admin-categories', component: () => import('@/views/admin/CategoriesView.vue'), meta: { title: 'Categories' } },
      { path: 'tags', name: 'admin-tags', component: () => import('@/views/admin/TagsView.vue'), meta: { title: 'Tags' } },
    ],
  },

  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAdmin) {
    if (!auth.isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (!auth.isAdmin) {
      ElMessage.error('Administrator access required')
      return { path: '/' }
    }
  }

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isLoggedIn) {
    return { path: '/' }
  }

  return true
})

router.afterEach((to) => {
  const base = 'Lumen'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})

export default router
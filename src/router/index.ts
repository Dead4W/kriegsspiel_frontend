import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import CreateRoomView from '@/views/CreateRoomView.vue'
import RoomView from '@/views/RoomView.vue'
import api from '@/api/client'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/create',
      name: 'create-room',
      component: CreateRoomView,
      meta: { requiresAuth: true },
    },
    {
      path: '/room/:uuid',
      name: 'room',
      component: RoomView,
      meta: { requiresAuth: true },
    },
    {
      path: '/room/:uuid/key/:key',
      name: 'room-key',
      component: RoomView,
      meta: { requiresAuth: true },
    }
  ],
})

// флаг, чтобы не проверять токен по 10 раз
let authChecked = false

router.beforeEach(async (to, from, next) => {
  if (!to.meta.requiresAuth) {
    return next()
  }

  const token = localStorage.getItem('token')

  if (!token) {
    return next({
      path: '/',
      query: { redirect_url: to.fullPath },
    })
  }

  // если уже проверяли токен — пускаем
  if (authChecked) {
    return next()
  }

  try {
    const r = await api.get('/user/auth')
    window.PLAYER = r.data;
    authChecked = true
    next()
  } catch {
    localStorage.removeItem('token')

    next({
      path: '/',
      query: { redirect_url: to.fullPath },
    })
  }
})

export default router

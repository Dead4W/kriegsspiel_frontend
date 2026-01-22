import { createRouter, createWebHistory } from 'vue-router'
import api from '@/api/client'
import i18n from '@/i18n'
import LocaleLayout from "@/views/layouts/LocaleLayout.vue";

const HomeView = () => import('@/views/HomeView.vue')
const CreateRoomView = () => import('@/views/CreateRoomView.vue')
const RoomView = () => import('@/views/RoomView.vue')

const supportedLocales = ['ru', 'en']
const defaultLocale = 'en'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/:locale(ru|en)',
      component: LocaleLayout,
      beforeEnter: (to, _from, next) => {
        const locale = to.params.locale as "ru" | "en"

        if (!supportedLocales.includes(locale)) {
          return next(`/${defaultLocale}`)
        }

        // синхронизация i18n
        i18n.global.locale.value = locale
        localStorage.setItem('i18n_locale', locale)

        next()
      },
      children: [
        {
          path: '',
          name: 'home',
          component: HomeView,
        },
        {
          path: 'create',
          name: 'create-room',
          component: CreateRoomView,
          meta: { requiresAuth: true },
        },
        {
          path: 'room/:uuid',
          name: 'room',
          component: RoomView,
          meta: { requiresAuth: true },
        },
        {
          path: 'room/:uuid/key/:key',
          name: 'room-key',
          component: RoomView,
          meta: { requiresAuth: true },
        }
      ]
    },

    // редирект с /
    {
      path: '/',
      redirect: () => {
        const saved = localStorage.getItem('i18n_locale')
        return `/${saved || defaultLocale}`
      }
    }
  ]
})

/* ================= AUTH GUARD ================= */

let authChecked = false

router.beforeEach(async (to, from, next) => {
  if (!to.meta.requiresAuth) return next()

  const token = localStorage.getItem('token')

  if (!token) {
    return next({
      path: `/${to.params.locale}`,
      query: { redirect_url: to.fullPath },
    })
  }

  if (authChecked) return next()

  try {
    const r = await api.get('/user/auth')
    window.PLAYER = r.data
    authChecked = true
    next()
  } catch {
    localStorage.removeItem('token')
    next({
      path: `/${to.params.locale}`,
      query: { redirect_url: to.fullPath },
    })
  }
})

export default router

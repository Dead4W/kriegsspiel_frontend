<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHead } from '@vueuse/head'
import api from '@/api/client'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const user = ref<{ id: number; name: string } | null>(null)
const showAuth = ref(false)
const nickname = ref('')
const loading = ref(false)
const error = ref('')

const COOKIE_CONSENT_KEY = 'cookie_consent_v1'
const hasAcceptedCookies = ref(false)

const showCookieBanner = computed(() => !hasAcceptedCookies.value)
const updates = ref<{ date: string; items: string[] }[]>([])
const updatesLoading = ref(false)

const UPDATES_URL = 'https://dead4w.github.io/kriegsspiel_frontend/UPDATES.md'

function parseUpdatesMarkdown(text: string): { date: string; items: string[] }[] {
  const result: { date: string; items: string[] }[] = []
  const lines = text.split('\n')
  let current: { date: string; items: string[] } | null = null

  for (const line of lines) {
    const dateMatch = line.match(/^\[(\d{4}-\d{2}-\d{2})\]/)
    if (dateMatch?.[1]) {
      if (current) result.push(current)
      current = { date: dateMatch[1], items: [] }
      continue
    }
    const itemMatch = line.match(/^-\s*(.+)$/)
    if (itemMatch?.[1] && current) {
      current.items.push(itemMatch[1].trim())
    }
  }
  if (current) result.push(current)
  return result
}

async function fetchUpdates() {
  updatesLoading.value = true
  try {
    const res = await fetch(UPDATES_URL)
    const text = await res.text()
    updates.value = parseUpdatesMarkdown(text)
  } catch {
    updates.value = []
  } finally {
    updatesLoading.value = false
  }
}

function signInWithGoogle() {
  const redirect = route.query.redirect_url
  const url = new URL(import.meta.env.VITE_GOOGLE_SIGNIN_URL)
  if (redirect) url.searchParams.set('redirect_url', redirect as string)
  window.location.href = url.toString()
}

useHead(() => ({
  title: t('seo.title'),
  htmlAttrs: {
    lang: locale.value
  },
  meta: [
    {
      name: 'description',
      content: t('seo.description')
    },
    {
      property: 'og:title',
      content: t('seo.ogTitle')
    },
    {
      property: 'og:description',
      content: t('seo.ogDescription')
    },
    {
      property: 'og:locale',
      content: locale.value === 'ru' ? 'ru_RU' : 'en_US'
    },
    { name: 'twitter:title', content: t('seo.ogTitle') },
    { name: 'twitter:description', content: t('seo.ogDescription') }
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "VideoGame",
        "name": "KRIEGSSPIEL online",
        "description": t('seo.description'),
        "genre": ["Strategy", "War"],
        "playMode": "MultiPlayer",
        "applicationCategory": "BrowserGame",
        "operatingSystem": "Web"
      })
    }
  ],
}))

const redirect = route.query.redirect_url as string | undefined
if (redirect) {
  router.replace(redirect);
}

function createRoom() {
  router.push({
    name: 'create-room',
    params: { locale: route.params.locale }
  })
}

function setLang(lang: 'ru' | 'en') {
  localStorage.setItem('i18n_locale', lang)
  router.push({
    name: route.name!,
    params: {
      ...route.params,
      locale: lang
    },
    query: route.query
  })
  locale.value = lang
  // location.reload()
}

// проверка токена
async function checkAuth() {
  try {
    const { data } = await api.get('/user/auth')
    user.value = data
  } catch {
    showAuth.value = true
  }
}

// регистрация
async function register() {
  if (!nickname.value.trim()) return

  loading.value = true
  error.value = ''

  try {
    const { data } = await api.post('/user/register', {
      name: nickname.value,
    })

    localStorage.setItem('token', data.token)
    user.value = {
      id: data.user_id,
      name: nickname.value,
    }
    showAuth.value = false
  } catch {
    error.value = 'Ошибка регистрации'
  } finally {
    loading.value = false
  }

  if (!error.value) {
    const redirect = route.query.redirect_url as string | undefined
    if (redirect) {
      router.replace(redirect);
    }
  }
}

onMounted(checkAuth)
onMounted(fetchUpdates)

onMounted(() => {
  try {
    hasAcceptedCookies.value = localStorage.getItem(COOKIE_CONSENT_KEY) === 'accepted'
  } catch {
    hasAcceptedCookies.value = false
  }
})

function acceptCookies() {
  localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted')
  hasAcceptedCookies.value = true
}
</script>

<template>
  <section class="home">
    <!-- основной экран -->
    <div class="card">
      <h1>{{ t('title') }}</h1>
      <p class="subtitle">
        <span>
          {{ t('subtitle') }}
        </span>
        <br>
        <br>
        <span v-if="user">
          {{ t('welcome') }}, {{ user.name }}
        </span>
      </p>

      <!-- переключатель языка -->
      <div class="lang">
        <button
          :class="{ active: route.params.locale === 'ru' }"
          @click="setLang('ru')"
        >
          RU
        </button>
        <button
          :class="{ active: route.params.locale === 'en' }"
          @click="setLang('en')"
        >
          EN
        </button>
      </div>

      <div class="actions">
        <button
          class="primary"
          @click="createRoom"
          :disabled="!user"
        >
          {{ t('createRoomBtn') }}
        </button>

      </div>

      <div class="updates-block">
        <div class="updates-list">
          <div v-if="updatesLoading" class="updates-loading">{{ t('loading') }}</div>
          <template v-else>
            <div v-for="group in updates" :key="group.date" class="updates-group">
            <div class="updates-date">{{ group.date }}</div>
            <ul class="updates-items">
              <li v-for="(item, i) in group.items" :key="i">{{ item }}</li>
            </ul>
          </div>
          </template>
        </div>
      </div>

      <div class="about-link">
        <template v-if="user">
          <router-link :to="{ name: 'profile', params: { locale: route.params.locale } }">
            {{ t('profile') }}
          </router-link>
          <span class="about-link__sep">•</span>
        </template>
        <router-link :to="{ name: 'about', params: { locale: route.params.locale } }">
          {{ t('about') }}
        </router-link>
      </div>
    </div>

    <!-- модалка авторизации (только после принятия cookies) -->
    <div v-if="showAuth && hasAcceptedCookies" class="modal">
      <div class="modal-card">
        <h2>{{ t('authModal.enterName') }}</h2>

        <button
          class="google-btn"
          @click="signInWithGoogle"
        >
          <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ t('authModal.signInWithGoogle') }}
        </button>

        <div class="auth-divider">
          <span>{{ t('authModal.or') }}</span>
        </div>

        <input
          v-model="nickname"
          type="text"
          :placeholder="t('authModal.nickname')"
          @keyup.enter="register"
        />

        <p v-if="error" class="error">
          {{ t(error) }}
        </p>

        <button
          class="primary"
          @click="register"
          :disabled="loading"
        >
          {{ loading ? '...' : t('continue') }}
        </button>
      </div>
    </div>

    <!-- required action: accept cookies to use site -->
    <div v-if="showCookieBanner" class="modal cookie-required-modal" role="dialog" aria-live="polite">
      <div class="modal-card cookie-required-card">
        <h2>{{ t('cookieBanner.requiredTitle') }}</h2>
        <p class="cookie-required__text">
          {{ t('cookieBanner.text') }}
          <span class="cookie-required__links">
            <router-link
              class="cookie-required__link"
              :to="{ name: 'cookies', params: { locale: route.params.locale } }"
            >
              {{ t('cookieBanner.cookiesLink') }}
            </router-link>
            <span class="cookie-required__sep">•</span>
            <router-link
              class="cookie-required__link"
              :to="{ name: 'privacy', params: { locale: route.params.locale } }"
            >
              {{ t('cookieBanner.privacyLink') }}
            </router-link>
          </span>
        </p>

        <button
          class="primary cookie-required__btn"
          @click="acceptCookies"
        >
          {{ t('cookieBanner.accept') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;

  background:
    linear-gradient(
      rgba(2, 6, 23, 0.75),
      rgba(2, 6, 23, 0.9)
    ),
    url('/assets/bg.jpg');

  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* переключатель языка */
.lang {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.lang button {
  min-width: 200px;
}

.lang button.active {
  border-color: var(--accent);
  color: var(--accent);
}

.card {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  padding: 3rem 4rem;
  border-radius: var(--radius-lg);
  text-align: center;
  box-shadow:
    var(--shadow-lg),
    var(--shadow-inset);
}

h1 {
  margin: 0;
  font-size: 3rem;
  letter-spacing: 0.2em;
}

.subtitle {
  margin: 1rem 0 2.5rem;
  color: var(--text-muted);
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.actions button {
  min-width: 200px;
  padding: 0.9rem 1.5rem;
  border: none;
}

.primary {
  background: var(--accent);
  color: var(--accent-contrast);
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
  filter: none;
}

.updates-block {
  margin-top: 1.5rem;
  text-align: left;
}

.updates-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.2s;
}

.updates-toggle:hover {
  color: var(--accent);
}

.updates-toggle__chevron {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

.updates-toggle__chevron.open {
  transform: rotate(180deg);
}

.updates-loading {
  color: var(--text-muted);
  font-size: 0.9rem;
  text-align: center;
  padding: 1rem;
}

.updates-list {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.4);
  border-radius: var(--radius, 8px);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.updates-group {
  margin-bottom: 0.75rem;
}

.updates-group:last-child {
  margin-bottom: 0;
}

.updates-date {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 0.25rem;
}

.updates-items {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.updates-items li {
  margin: 0.15rem 0;
}

.about-link {
  margin-top: 1.5rem;
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
}

.about-link a {
  color: var(--text-muted);
  text-decoration: underline;
  font-size: 0.95rem;
}

.about-link a:hover {
  color: var(--accent);
}

.about-link__sep {
  margin: 0 0.5rem;
  color: rgba(148, 163, 184, 0.7);
}

/* модалка */
.modal {
  position: fixed;
  inset: 0;
  background: var(--backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 2rem;
  width: 320px;
  text-align: center;
}

.modal-card h2 {
  margin-bottom: 1rem;
}

.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: var(--panel);
  color: var(--text);
  border-radius: var(--radius, 8px);
  cursor: pointer;
  font-size: 1rem;
  transition: border-color 0.2s, background 0.2s;
}

.google-btn:hover {
  border-color: rgba(148, 163, 184, 0.55);
  background: rgba(15, 23, 42, 0.4);
}

.google-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.auth-divider {
  display: flex;
  align-items: center;
  margin: 1rem 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(148, 163, 184, 0.25);
}

.auth-divider span {
  padding: 0 1rem;
}

.modal-card input {
  width: 100%;
  margin-bottom: 1rem;
}

.error {
  color: var(--danger);
  margin-bottom: 0.5rem;
}

.cookie-required-modal {
  z-index: 110;
}

.cookie-required-card {
  width: 400px;
  max-width: 90vw;
}

.cookie-required__text {
  color: var(--text-muted);
  line-height: 1.5;
  font-size: 0.95rem;
  margin: 0 0 1.5rem;
}

.cookie-required__links {
  display: inline;
}

.cookie-required__link {
  color: var(--accent);
  text-decoration: underline;
}

.cookie-required__link:hover {
  color: var(--accent-hover);
}

.cookie-required__sep {
  margin: 0 0.5rem;
  color: rgba(148, 163, 184, 0.7);
}

.cookie-required__btn {
  width: 100%;
  padding: 0.9rem 1.5rem;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  border-radius: var(--radius, 8px);
}
</style>

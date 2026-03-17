<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
const showCookieBanner = ref(false)

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

onMounted(() => {
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_KEY)
    showCookieBanner.value = !v
  } catch {
    showCookieBanner.value = true
  }
})

function acceptCookies() {
  localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted')
  showCookieBanner.value = false
}

function dismissCookies() {
  localStorage.setItem(COOKIE_CONSENT_KEY, 'dismissed')
  showCookieBanner.value = false
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

    <!-- модалка авторизации -->
    <div v-if="showAuth" class="modal">
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

    <div v-if="showCookieBanner && !showAuth" class="cookie-banner" role="dialog" aria-live="polite">
      <div class="cookie-banner__inner">
        <div class="cookie-banner__text">
          {{ t('cookieBanner.text') }}
          <span class="cookie-banner__links">
            <router-link
              class="cookie-banner__link"
              :to="{ name: 'cookies', params: { locale: route.params.locale } }"
            >
              {{ t('cookieBanner.cookiesLink') }}
            </router-link>
            <span class="cookie-banner__sep">•</span>
            <router-link
              class="cookie-banner__link"
              :to="{ name: 'privacy', params: { locale: route.params.locale } }"
            >
              {{ t('cookieBanner.privacyLink') }}
            </router-link>
          </span>
        </div>

        <div class="cookie-banner__actions">
          <button class="cookie-banner__btn" @click="dismissCookies">
            {{ t('cookieBanner.dismiss') }}
          </button>
          <button class="primary cookie-banner__btn cookie-banner__btn--primary" @click="acceptCookies">
            {{ t('cookieBanner.accept') }}
          </button>
        </div>
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

.cookie-banner {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.82);
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(10px);
}

.cookie-banner__inner {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.cookie-banner__text {
  color: var(--text-muted);
  line-height: 1.4;
  font-size: 0.95rem;
}

.cookie-banner__links {
  margin-left: 0.5rem;
  white-space: nowrap;
}

.cookie-banner__link {
  color: var(--accent);
  text-decoration: underline;
}

.cookie-banner__link:hover {
  color: var(--accent-hover);
}

.cookie-banner__sep {
  margin: 0 0.5rem;
  color: rgba(148, 163, 184, 0.7);
}

.cookie-banner__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.cookie-banner__btn {
  padding: 0.75rem 1rem;
  min-width: 140px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(15, 23, 42, 0.25);
  color: var(--text);
}

.cookie-banner__btn:hover {
  border-color: rgba(148, 163, 184, 0.45);
}

.cookie-banner__btn--primary {
  border: none;
}

@media (max-width: 720px) {
  .cookie-banner__inner {
    flex-direction: column;
    align-items: stretch;
  }

  .cookie-banner__actions {
    justify-content: stretch;
  }

  .cookie-banner__btn {
    width: 100%;
  }

  .cookie-banner__links {
    white-space: normal;
  }
}
</style>

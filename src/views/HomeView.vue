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

useHead(() => ({
  title: t('seo.title'),
  htmlAttrs: {
    lang: locale.value
  },
  // link: [
  //   {
  //     rel: 'alternate',
  //     hreflang: 'ru',
  //     href: `${location.origin}/ru${route.path.replace(/^\/(ru|en)/, '')}`
  //   },
  //   {
  //     rel: 'alternate',
  //     hreflang: 'en',
  //     href: `${location.origin}/en${route.path.replace(/^\/(ru|en)/, '')}`
  //   }
  // ],
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
        <router-link
          :to="{ name: 'about', params: { locale: route.params.locale } }"
        >
          {{ t('about') }}
        </router-link>
      </div>
    </div>

    <!-- модалка авторизации -->
    <div v-if="showAuth" class="modal">
      <div class="modal-card">
        <h2>{{ t('authModal.enterName') }}</h2>

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

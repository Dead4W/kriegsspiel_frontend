<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/api/client'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const user = ref<{ id: number; name: string } | null>(null)
const showAuth = ref(false)
const nickname = ref('')
const loading = ref(false)
const error = ref('')

const redirect = route.query.redirect_url as string | undefined
if (redirect) {
  router.replace(redirect);
}

function createRoom() {
  router.push('/create')
}

function joinRoom() {
  router.push('/join')
}

function setLang(lang: 'ru' | 'en') {
  locale.value = lang
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
</script>

<template>
  <section class="home">
    <!-- переключатель языка -->
    <div class="lang">
      <button
        :class="{ active: locale === 'ru' }"
        @click="setLang('ru')"
      >
        RU
      </button>
      <button
        :class="{ active: locale === 'en' }"
        @click="setLang('en')"
      >
        EN
      </button>
    </div>

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

      <div class="actions">
        <button
          class="primary"
          @click="createRoom"
          :disabled="!user"
        >
          {{ t('createRoom') }}
        </button>

<!--        <button-->
<!--          class="secondary"-->
<!--          @click="joinRoom"-->
<!--          :disabled="!user"-->
<!--        >-->
<!--          {{ t('joinRoom') }}-->
<!--        </button>-->
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
    url('https://i0.wp.com/militaryhistorynow.com/wp-content/uploads/2018/05/kriegsspiel-1.jpg?fit=700%2C503&ssl=1');

  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* переключатель языка */
.lang {
  position: absolute;
  top: 1.5rem;
  right: 2rem;
  display: flex;
  gap: 0.5rem;
}

.lang button {
  background: transparent;
  border: 1px solid #334155;
  color: #cbd5f5;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.7;
}

.lang button.active {
  opacity: 1;
  border-color: var(--accent);
  color: var(--accent);
}

.card {
  background: linear-gradient(180deg, #020617, #020617cc);
  border: 1px solid #1e293b;
  padding: 3rem 4rem;
  border-radius: 16px;
  text-align: center;
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

h1 {
  margin: 0;
  font-size: 3rem;
  letter-spacing: 0.2em;
}

.subtitle {
  margin: 1rem 0 2.5rem;
  color: #94a3b8;
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

button {
  min-width: 200px;
  padding: 0.9rem 1.5rem;
  border-radius: 10px;
  font-size: 1rem;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary {
  background: var(--accent);
  color: #022c22;
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--secondary);
}

.secondary:hover:not(:disabled) {
  background: var(--secondary);
}

/* модалка */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  background: #020617;
  border: 1px solid #1e293b;
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
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid #334155;
  background: transparent;
  color: #fff;
  margin-bottom: 1rem;
}

.error {
  color: #f87171;
  margin-bottom: 0.5rem;
}
</style>

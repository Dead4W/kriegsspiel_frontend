<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/api/client'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (!password.value.trim()) return

  const uuid = route.params.uuid as string
  loading.value = true
  error.value = ''

  try {
    // пробуем зайти в комнату с паролем
    await api.get(`/room/${uuid}`, {
      headers: {
        'X-Room-Password': password.value,
      },
    })

    // сохраняем пароль
    localStorage.setItem(`room_pass_${uuid}`, password.value)

    // возвращаемся в комнату
    router.replace(`/room/${uuid}`)
  } catch (e: any) {
    if (e.response?.status === 403) {
      error.value = 'error.bad_password'
    } else {
      error.value = 'error.room_not_found'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="password">
    <div class="card">
      <h1>{{ t('room.enter_password') }}</h1>

      <input
        v-model="password"
        type="password"
        :placeholder="t('room.password')"
        @keyup.enter="submit"
      />

      <p v-if="error" class="error">
        {{ t(error) }}
      </p>

      <button
        class="primary"
        :disabled="loading"
        @click="submit"
      >
        {{ loading ? t('loading') : t('continue') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.password {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  width: 360px;
  background: linear-gradient(180deg, #020617, #020617cc);
  border: 1px solid #1e293b;
  padding: 2rem;
  border-radius: 16px;
  text-align: center;
}

input {
  width: 100%;
  margin: 1rem 0;
  padding: 0.6rem;
  border-radius: 8px;
  border: 1px solid #334155;
  background: transparent;
  color: #fff;
}

.error {
  color: #f87171;
  margin-bottom: 0.8rem;
}

.primary {
  width: 100%;
  padding: 0.7rem;
  border-radius: 10px;
  border: none;
  background: var(--accent);
  color: #022c22;
}
</style>

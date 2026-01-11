<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ROOM_SETTINGS } from '@/game/roomSettings'

const router = useRouter()
const { t } = useI18n()

const roomName = ref('')
const password = ref('')
const showAdvanced = ref(false)

import api from '@/api/client'

type RoomSettingsState = Record<string, boolean | string>
/** состояние настроек комнаты */
const settings = ref<RoomSettingsState>(
  Object.fromEntries(
    ROOM_SETTINGS.map(s => [s.key, s.default])
  )
)

async function createRoom() {
  if (!roomName.value.trim()) return

  const payload = {
    name: roomName.value.trim(),
    password: password.value ? password.value : null,
    options: settings.value,
  }

  try {
    const { data } = await api.put('/room', payload)

    if (password.value) {
      localStorage.setItem(`room_pass_${data.uuid}`, password.value);
    }

    localStorage.setItem(`room_key_${data.uuid}`, data.admin_key)
    localStorage.setItem(`room_admin_key_${data.uuid}`, data.admin_key)

    // 👉 редирект в комнату по uuid
    await router.push(`/room/${data.uuid}`)
  } catch (e) {
    console.error('CREATE ROOM ERROR:', e)
  }
}
</script>

<template>
  <section class="create">
    <div class="card">
      <h1>{{ t('createRoom.title') }}</h1>

      <!-- Название комнаты -->
      <div class="field">
        <label>{{ t('createRoom.roomName.label') }}</label>
        <input
          v-model="roomName"
          :placeholder="t('createRoom.roomName.placeholder')"
        />
      </div>

<!--      &lt;!&ndash; Пароль &ndash;&gt;-->
<!--      <div class="field">-->
<!--        <label>Пароль (опционально)</label>-->
<!--        <input-->
<!--          v-model="password"-->
<!--          type="password"-->
<!--          placeholder="••••••"-->
<!--        />-->
<!--      </div>-->

      <!-- Дополнительные настройки -->
      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        {{ t('createRoom.advanced.toggle') }}
        <span :class="{ open: showAdvanced }">▾</span>
      </button>

      <div v-if="showAdvanced" class="advanced">
        <div
          v-for="setting in ROOM_SETTINGS"
          :key="setting.key"
          class="setting"
          :class="[setting.level, setting.type]"
        >
          <!-- Boolean -->
          <label v-if="setting.type === 'boolean'" class="checkbox">
            <input
              type="checkbox"
              v-model="settings[setting.key]"
            />

            <div>
              <div class="label">
                <span
                  v-if="setting.level !== 'stable'"
                  class="badge"
                >
                  {{ setting.level.toUpperCase() }}
                </span>
                {{ t(setting.i18nLabel) }}
              </div>

              <small v-if="setting.i18nDescription">
                {{ t(setting.i18nDescription) }}
              </small>
            </div>
          </label>

          <!-- String -->
          <div v-else class="field">
            <label>
                <span
                  v-if="setting.level !== 'stable'"
                  class="badge"
                >
                  {{ setting.level.toUpperCase() }}
                </span>
              {{ t(setting.i18nLabel) }}
            </label>

            <input
              type="text"
              v-model="settings[setting.key]"
              :placeholder="setting.placeholderI18n ? t(setting.placeholderI18n) : ''"
            />

            <small v-if="setting.i18nDescription">
              {{ t(setting.i18nDescription) }}
            </small>
          </div>
        </div>
      </div>

      <!-- Действия -->
      <div class="actions">
        <button class="primary" @click="createRoom">
          {{ t('createRoom.actions.create') }}
        </button>

        <button class="secondary" @click="router.back()">
          {{ t('createRoom.actions.cancel') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.create {
  flex: 1;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

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

.card {
  width: 600px;
  background: linear-gradient(180deg, #020617, #020617cc);
  border: 1px solid #1e293b;
  padding: 2.5rem 3rem;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

h1 {
  margin-bottom: 2rem;
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  margin-bottom: 1.2rem;
}

label {
  font-size: 0.85rem;
  margin-bottom: 0.3rem;
  color: #cbd5f5;
}

input {
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  border: 1px solid #1e293b;
  background: #020617;
  color: #e5e7eb;
}

input:focus {
  outline: none;
  border-color: var(--accent);
}

.advanced-toggle {
  margin: 1.5rem 0 1rem;
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.advanced-toggle span {
  transition: transform 0.2s ease;
}

.advanced-toggle span.open {
  transform: rotate(180deg);
}

.advanced {
  border: 1px dashed #1e293b;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.checkbox {
  display: flex;
  gap: 0.7rem;
  margin-bottom: 0.8rem;
  font-size: 0.9rem;
}

.checkbox small {
  display: block;
  color: #94a3b8;
  margin-top: 0.2rem;
}

.checkbox.beta {
  color: #fbbf24;
}

.checkbox.unstable {
  color: #f87171;
}

.badge {
  margin-right: 0.4rem;
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  color: #000;
  background: rgba(255, 189, 0, 0.87);
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.primary {
  flex: 1;
  background: var(--accent);
  color: #022c22;
  padding: 0.7rem;
  border-radius: 10px;
  border: none;
}

.secondary {
  flex: 1;
  background: transparent;
  color: var(--text);
  border: 1px solid var(--secondary);
  border-radius: 10px;
}
</style>

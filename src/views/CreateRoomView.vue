<script setup lang="ts">
import {ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ROOM_SETTINGS } from '@/game/roomSettings'
import api from '@/api/client'
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const roomName = ref('')
const showAdvanced = ref(false)
const selectedMapId = ref<string>('essex')

const customMapUrl = ref('')
const customHeightMapUrl = ref('')
const customMetersPerPixel = ref('')
const gameDate = ref('1882-06-12 09:00:00')

type RoomSettingsState = Record<string, boolean | string | number>
/** состояние настроек комнаты */
const settings = ref<RoomSettingsState>(
  Object.fromEntries(
    ROOM_SETTINGS.map(s => [s.key, s.default])
  )
)

/* MAPS */
type GameMap = {
  id: string
  name: string
  preview: string
  mapUrl?: string
  heightMapUrl?: string
  metersPerPixel?: number
  custom?: boolean
}


const GAME_MAPS: GameMap[] = [
  {
    id: 'essex',
    name: 'Essex 1882',
    preview: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map_preview.jpeg',
    mapUrl: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg',
    heightMapUrl: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_height_map.png',
    metersPerPixel: 5.38,
  },
  {
    id: 'saint_petersburg',
    name: 'Saint-Petersburg 1828',
    preview: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/spb_preview.jpg',
    mapUrl: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/spb.jpg',
    heightMapUrl: '',
    metersPerPixel: 1.075,
  },
  {
    id: 'custom',
    name: 'Custom map',
    preview: '',
    custom: true,
  },
]

// Map selector
watch(selectedMapId, () => {
  applyMapSettings()
})
function applyMapSettings() {
  const map = GAME_MAPS.find(m => m.id === selectedMapId.value)
  if (!map) return

  if (map.custom) {
    settings.value[ROOM_SETTING_KEYS.MAP_URL] = customMapUrl.value || ''
    settings.value[ROOM_SETTING_KEYS.HEIGHT_MAP_URL] = customHeightMapUrl.value || ''
    settings.value[ROOM_SETTING_KEYS.MAP_METERS_PER_PIXEL] = +(customMetersPerPixel.value || 1)
  } else {
    settings.value[ROOM_SETTING_KEYS.MAP_URL] = map.mapUrl!
    settings.value[ROOM_SETTING_KEYS.HEIGHT_MAP_URL] = map.heightMapUrl!
    settings.value[ROOM_SETTING_KEYS.MAP_METERS_PER_PIXEL] = +(map.metersPerPixel || 1)
  }
}
applyMapSettings()

async function createRoom() {
  if (!roomName.value.trim()) return

  const payload = {
    name: roomName.value.trim(),
    options: settings.value,
    time: gameDate.value,
  }

  try {
    const { data } = await api.put('/room', payload)

    localStorage.setItem(`room_key_${data.uuid}`, data.admin_key)
    localStorage.setItem(`room_admin_key_${data.uuid}`, data.admin_key)

    // 👉 редирект в комнату по uuid
    await router.push({
      name: 'room',
      params: {locale: route.params.locale, uuid: data.uuid}
    })
  } catch (e) {
    console.error('CREATE ROOM ERROR:', e)
  }
}
</script>

<template>
  <section class="create">
    <form @submit.prevent="createRoom">
      <div class="card">
        <h1>{{ t('createRoom.title') }}</h1>

        <!-- Название комнаты -->
        <div class="field">
          <label>{{ t('createRoom.roomName.label') }}</label>
          <input
            required
            v-model="roomName"
            :placeholder="t('createRoom.roomName.placeholder')"
          />
        </div>

        <!-- Дополнительные настройки -->
        <button class="advanced-toggle" @click="showAdvanced = !showAdvanced" type="button">
          {{ t('createRoom.advanced.toggle') }}
          <span :class="{ open: showAdvanced }">▾</span>
        </button>

        <div v-if="showAdvanced" class="advanced">
          <!-- Дата и время игры -->
          <div class="field">
            <label>{{ t('settings.gameDate') }}</label>
            <input
              v-model="gameDate"
              placeholder="1882-06-12 09:00:00"
              pattern="\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"
            />
            <small>
              {{ t('settings.gameDateFormat') }}: YYYY-MM-DD HH:mm:ss
            </small>
          </div>

          <div class="map-selector">
            <h3>{{ t('settings.customMap.title') }}</h3>

            <div class="map-grid">
              <button
                v-for="map in GAME_MAPS"
                :key="map.id"
                class="map-card"
                :class="{ active: selectedMapId === map.id }"
                @click="selectedMapId = map.id"
                type="button"
              >
                <div
                  class="preview"
                  :style="map.preview ? { backgroundImage: `url(${map.preview})` } : {}"
                >
                  <span v-if="map.custom">
                    Custom
                    <br>
                    PNG, JPEG
                  </span>
                </div>

                <div class="name">{{ map.name }}</div>
              </button>
            </div>

            <!-- Кастомная карта -->
            <div v-if="selectedMapId === 'custom'" class="custom-map">
              <div class="field">
                <label>{{ t('settings.customMap.mapUrl') }}</label>
                <input required v-model="customMapUrl"  placeholder="https://example.com/map.jpeg" @input="applyMapSettings" />
              </div>

              <div class="field">
                <label>{{ t('settings.customMap.heightMapUrl') }}</label>
                <input v-model="customHeightMapUrl" placeholder="https://example.com/height_map.jpeg" @input="applyMapSettings" />
              </div>

              <div class="field">
                <label>{{ t('settings.customMap.metersPerPixel') }}</label>
                <input
                  v-model="customMetersPerPixel"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="1.00"
                  @input="applyMapSettings"
                />
              </div>
            </div>
          </div>

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
          <button class="primary" type="submit">
            {{ t('createRoom.actions.create') }}
          </button>

          <button class="secondary" @click="router.back()" type="button">
            {{ t('createRoom.actions.cancel') }}
          </button>
        </div>
      </div>
    </form>
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
    url('/assets/bg.jpg');

  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.card {
  width: 600px;
  background: var(--panel);
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

.map-selector {
  margin-bottom: 1.5rem;
  color: var(--text);
}

.map-selector h3 {
  font-size: 0.9rem;
  margin-bottom: 0.6rem;
  color: #cbd5f5;
  margin-top: 0px;
}

.map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.8rem;
}

.map-card {
  border: 1px solid #1e293b;
  border-radius: 10px;
  background: #020617;
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  transition: border-color 0.15s, transform 0.15s;
}

.map-card:hover {
  transform: translateY(-2px);
}

.map-card.active {
  border-color: var(--accent);
}

.map-card .preview {
  height: 90px;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 0.75rem;
}

.map-card .name {
  padding: 0.4rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text);
}

.custom-map {
  margin-top: 1rem;
}

</style>

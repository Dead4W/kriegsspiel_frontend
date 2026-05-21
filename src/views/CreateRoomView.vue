<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ROOM_SETTINGS } from '@/game/roomSettings'
import api from '@/api/client'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys.ts'

type SavedResourcePack = {
  id: number
  public_id: string
  public_url: string
  name: string
  is_public: boolean
  is_default: boolean
  is_editable: boolean
}

type RoomSettingsState = Record<string, boolean | string | number>

type GameMap = {
  id: string
  name: string
  preview: string
  mapUrl?: string
  heightMapUrl?: string
  objectMapUrl?: string
  objectMapMetaUrl?: string
  metersPerPixel?: number
  custom?: boolean
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const roomName = ref('')
const isCreating = ref(false)
const showAdvanced = ref(true)
const selectedMapId = ref<string>('essex')

const customMapUrl = ref('')
const customHeightMapUrl = ref('')
const customObjectMapUrl = ref('')
const customObjectMapMetaUrl = ref('')
const customMetersPerPixel = ref('')
const gameDate = ref('1882-06-12 09:00:00')

const isTemplatesLoading = ref(false)
const templateError = ref('')
const savedTemplates = ref<SavedResourcePack[]>([])
const selectedTemplateId = ref<number | null>(null)
const selectedTemplatePublicId = ref('')
const resourcePackUrl = ref('')

const settings = ref<RoomSettingsState>(
  Object.fromEntries(
    ROOM_SETTINGS.map(s => [s.key, s.default])
  )
)

const GAME_MAPS: GameMap[] = [
  {
    id: 'essex',
    name: 'Essex 1882',
    preview: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map_preview.jpeg',
    mapUrl: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg',
    heightMapUrl: 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_height_map.png',
    objectMapUrl: `${location.origin}/assets/default_map_objects.png`,
    objectMapMetaUrl: `${location.origin}/assets/default_map_objects_meta.json`,
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

const isCustomMapSelected = computed(() => selectedMapId.value === 'custom')
const hasCustomObjectMapUrl = computed(() => customObjectMapUrl.value.trim().length > 0)
const hasCustomObjectMapMetaUrl = computed(() => customObjectMapMetaUrl.value.trim().length > 0)
const isObjectMapPairValid = computed(() => {
  if (!isCustomMapSelected.value) return true
  return hasCustomObjectMapUrl.value === hasCustomObjectMapMetaUrl.value
})

const selectedTemplate = computed(() => {
  return savedTemplates.value.find(template => template.id === selectedTemplateId.value) || null
})

function applyMapSettings() {
  const map = GAME_MAPS.find(m => m.id === selectedMapId.value)
  if (!map) return

  if (map.custom) {
    settings.value[ROOM_SETTING_KEYS.MAP_URL] = customMapUrl.value || ''
    settings.value[ROOM_SETTING_KEYS.HEIGHT_MAP_URL] = customHeightMapUrl.value || ''
    settings.value[ROOM_SETTING_KEYS.OBJECT_MAP_URL] = customObjectMapUrl.value || ''
    settings.value[ROOM_SETTING_KEYS.OBJECT_MAP_META_URL] = customObjectMapMetaUrl.value || ''
    settings.value[ROOM_SETTING_KEYS.MAP_METERS_PER_PIXEL] = +(customMetersPerPixel.value || 1)
    return
  }

  settings.value[ROOM_SETTING_KEYS.MAP_URL] = map.mapUrl!
  settings.value[ROOM_SETTING_KEYS.HEIGHT_MAP_URL] = map.heightMapUrl!
  settings.value[ROOM_SETTING_KEYS.OBJECT_MAP_URL] = map.objectMapUrl || ''
  settings.value[ROOM_SETTING_KEYS.OBJECT_MAP_META_URL] = map.objectMapMetaUrl || ''
  settings.value[ROOM_SETTING_KEYS.MAP_METERS_PER_PIXEL] = +(map.metersPerPixel || 1)
}

function applySelectedTemplate() {
  const template = selectedTemplate.value
  selectedTemplatePublicId.value = template?.public_id || ''
  resourcePackUrl.value = template?.public_url || ''
}

function openCustomize() {
  const query: Record<string, string> = {
    return_to: 'create-room',
  }
  if (selectedTemplatePublicId.value.trim()) {
    query.resource_pack_public_id = selectedTemplatePublicId.value.trim()
  }

  router.push({
    name: 'resource-pack-creator',
    params: { locale: route.params.locale },
    query,
  })
}

async function loadTemplates() {
  isTemplatesLoading.value = true
  templateError.value = ''

  try {
    const { data } = await api.get('/resource-pack')
    const templates = Array.isArray(data) ? (data as SavedResourcePack[]) : []
    savedTemplates.value = templates

    const routeResourcePackPublicId = String(route.query.resource_pack_public_id || '').trim()
    const selectedFromRoute = routeResourcePackPublicId
      ? templates.find(template => template.public_id === routeResourcePackPublicId)
      : null
    const fallbackTemplate = templates.find(template => template.is_default) || templates[0] || null
    const nextTemplate = selectedFromRoute || fallbackTemplate

    selectedTemplateId.value = nextTemplate?.id ?? null
    applySelectedTemplate()
  } catch (error) {
    console.error('LOAD RESOURCE PACK TEMPLATES ERROR:', error)
    templateError.value = t('createRoom.customize.errors.loadFailed')
  } finally {
    isTemplatesLoading.value = false
  }
}

async function createRoom() {
  if (!roomName.value.trim() || isCreating.value || !isObjectMapPairValid.value) return

  const nextPublicId = selectedTemplatePublicId.value.trim()
  if (!nextPublicId) {
    templateError.value = t('createRoom.customize.errors.publicIdRequired')
    return
  }

  try {
    await api.get(`/resource-pack/${encodeURIComponent(nextPublicId)}`)
  } catch (error) {
    console.error('RESOURCE PACK EXISTS CHECK ERROR:', error)
    templateError.value = t('createRoom.customize.errors.publicIdNotFound')
    return
  }

  isCreating.value = true
  templateError.value = ''
  const payload = {
    name: roomName.value.trim(),
    options: settings.value,
    time: gameDate.value,
    resource_pack_public_id: nextPublicId,
  }

  try {
    const { data } = await api.put('/room', payload)

    localStorage.setItem(`room_key_${data.uuid}`, data.admin_key)
    localStorage.setItem(`room_admin_key_${data.uuid}`, data.admin_key)

    await router.push({
      name: 'room',
      params: { locale: route.params.locale, uuid: data.uuid },
    })
  } catch (error) {
    console.error('CREATE ROOM ERROR:', error)
  } finally {
    isCreating.value = false
  }
}

watch(selectedMapId, applyMapSettings)
watch(selectedTemplateId, applySelectedTemplate)

onMounted(async () => {
  applyMapSettings()
  await loadTemplates()
})
</script>

<template>
  <section class="create">
    <div class="card">
      <form @submit.prevent="createRoom">
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
            <h3>{{ t('settings.resourcePack.title') }}</h3>

            <div class="field">
              <label>{{ t('settings.resourcePack.select') }}</label>
              <RouterLink
                class="help-link"
                :to="{
                  name: 'wiki',
                  params: { locale: route.params.locale },
                  query: { section: 'resourcepack', tab: 'overview' },
                }"
              >
                Resource pack docs
              </RouterLink>
              <select
                v-model.number="selectedTemplateId"
                :disabled="isTemplatesLoading || !savedTemplates.length"
              >
                <option
                  v-for="template in savedTemplates"
                  :key="template.id"
                  :value="template.id"
                >
                  {{ template.name }}{{ template.is_default ? ' (Default)' : '' }}
                </option>
              </select>
              <label class="resource-pack-public-id-label">
                {{ t('settings.resourcePack.publicId') }}
              </label>
              <input
                v-model.trim="selectedTemplatePublicId"
                :placeholder="t('settings.resourcePack.publicIdPlaceholder')"
                :disabled="isTemplatesLoading"
              />
              <small>{{ t('settings.resourcePack.description') }}</small>
              <small v-if="templateError" class="template-error">
                {{ templateError }}
              </small>

              <button
                class="secondary customize-trigger"
                type="button"
                @click="openCustomize"
              >
                {{ t('createRoom.customize.button') }}
              </button>
            </div>
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
                  <span
                    v-if="map.objectMapUrl && map.objectMapMetaUrl"
                    class="map-tag"
                  >
                    3D
                  </span>
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
                <a
                  class="help-link"
                  href="https://github.com/Dead4W/kriegsspiel_backend/blob/main/helpers/generate_height_map.py"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  generate_height_map.py <span class="help-link__icon" aria-hidden="true">↗</span>
                </a>
                <input v-model="customHeightMapUrl" placeholder="https://example.com/height_map.jpeg" @input="applyMapSettings" />
              </div>

              <div
                class="object-map-group"
                :class="{ invalid: !isObjectMapPairValid }"
              >
                <label class="object-map-group__title">
                  {{ t('settings.customMap.objectMapGroupTitle') }}
                </label>
                <RouterLink
                  class="help-link"
                  :to="{
                    name: 'wiki',
                    params: { locale: route.params.locale },
                    query: { section: 'getting-started', tab: 'map-3d' },
                  }"
                >
                  {{ t('settings.customMap.wiki3dMapLink') }}
                </RouterLink>

                <div class="field">
                  <label>{{ t('settings.customMap.objectMapUrl') }}</label>
                  <input
                    v-model="customObjectMapUrl"
                    :required="hasCustomObjectMapMetaUrl"
                    placeholder="https://example.com/object_map.png"
                    @input="applyMapSettings"
                  />
                </div>

                <div class="field">
                  <label>{{ t('settings.customMap.objectMapMetaUrl') }}</label>
                  <input
                    v-model="customObjectMapMetaUrl"
                    :required="hasCustomObjectMapUrl"
                    placeholder="https://example.com/object_map_meta.json"
                    @input="applyMapSettings"
                  />
                </div>

                <small v-if="!isObjectMapPairValid" class="object-map-group__error">
                  {{ t('settings.customMap.objectMapPairError') }}
                </small>
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
          <button class="primary" type="submit" :disabled="isCreating || !isObjectMapPairValid || !selectedTemplatePublicId.trim()">
            {{ isCreating ? t('createRoom.actions.creating') : t('createRoom.actions.create') }}
          </button>

          <button class="secondary" @click="router.back()" type="button">
            {{ t('createRoom.actions.cancel') }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.create {
  flex: 1;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;

  /* view-tuned form controls (still using global input styles) */
  --control-bg: var(--panel);
  --control-border: var(--panel-border);

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
  width: min(600px, 100%);
  max-height: 100vh;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--panel-border);
  padding: 2.5rem 3rem;
  border-radius: var(--radius-lg);
  box-shadow:
    var(--shadow-lg),
    var(--shadow-inset);
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
  color: var(--text-soft);
}

.help-link {
  align-self: flex-start;
  width: fit-content;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
  padding: 0.35rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
  font-size: 0.82rem;
  line-height: 1.1;
  text-decoration: none;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.help-link:hover {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.06);
  transform: translateY(-1px);
}

.help-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.help-link__icon {
  opacity: 0.85;
  font-size: 0.95em;
}

.customize-trigger {
  margin-top: 0.6rem;
}

.resource-pack-public-id-label {
  margin-top: 0.7rem;
}

.customize-panel {
  margin-top: 0.9rem;
  padding: 0.9rem;
  border: 1px dashed var(--panel-border);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.02);
}

.customize-panel select,
.customize-panel textarea {
  width: 100%;
}

.customize-panel textarea {
  resize: vertical;
  min-height: 220px;
  font-family: monospace;
}

.customize-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.3rem;
}

.customize-actions button {
  flex: 1;
  min-width: 120px;
}

.danger {
  border-color: var(--danger);
  color: var(--danger);
}

.template-error {
  display: block;
  margin-top: 0.5rem;
  color: var(--danger);
}

.advanced-toggle {
  margin: 1.5rem 0 1rem;
  background: none;
  border: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.advanced-toggle:hover {
  border: none;
  background: none;
}

.advanced-toggle span {
  transition: transform 0.2s ease;
}

.advanced-toggle span.open {
  transform: rotate(180deg);
}

.advanced {
  border: 1px dashed var(--panel-border);
  padding: 1rem;
  border-radius: var(--radius-sm);
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
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.checkbox.beta {
  color: var(--warning);
}

.checkbox.unstable {
  color: var(--danger);
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

.actions button {
  flex: 1;
  padding: 0.7rem;
}

.primary {
  background: var(--accent);
  color: var(--accent-contrast);
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  filter: none;
}

.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--secondary);
}

.secondary:hover:not(:disabled) {
  background: var(--secondary-hover-bg);
  border-color: var(--accent);
  border: 1px solid var(--secondary);
}

.map-selector {
  margin-bottom: 1.5rem;
  color: var(--text);
}

.map-selector h3 {
  font-size: 0.9rem;
  margin-bottom: 0.6rem;
  color: var(--text-soft);
  margin-top: 0px;
}

.map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.8rem;
}

.map-card {
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: var(--panel);
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
  position: relative;
  height: 90px;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.map-tag {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  padding: 0.15rem 0.35rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
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

.object-map-group {
  margin-bottom: 1.2rem;
  padding: 0.8rem;
  border: 1px dashed var(--panel-border);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.02);
}

.object-map-group.invalid {
  border-color: var(--danger);
}

.object-map-group__title {
  display: block;
  margin-bottom: 0.25rem;
}

.object-map-group .field:last-of-type {
  margin-bottom: 0;
}

.object-map-group__error {
  display: block;
  margin-top: 0.45rem;
  color: var(--danger);
}

</style>

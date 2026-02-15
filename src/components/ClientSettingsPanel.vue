<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CLIENT_SETTING_KEYS,
  type ClientSettingKey,
} from '@/enums/clientSettingsKeys'

const { t, locale } = useI18n()
import {Team} from "@/enums/teamKeys.ts";
import {useRoute, useRouter} from "vue-router";


const router = useRouter()
const route = useRoute()

const settings = reactive(window.CLIENT_SETTINGS)

const isOpen = ref(false)

const isAdmin = computed(() => window.PLAYER.team === Team.ADMIN)

type ClientSettingsUiItem =
  | { kind: 'hr' }
  | {
      kind: 'checkbox'
      key: ClientSettingKey
      labelI18nKey: string
      indent?: boolean
      adminOnly?: boolean
      disabled?: () => boolean
    }
  | {
      kind: 'range'
      key: ClientSettingKey
      labelI18nKey: string
      min: number
      max: number
      step: number
      valueFormat?: 'fixed2'
      testSound?: boolean
    }

const uiDef: ClientSettingsUiItem[] = [
  { kind: 'hr' },

  // Dark theme
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.DARK_THEME,
    labelI18nKey: 'client_settings.dark_theme',
  },

  { kind: 'hr' },

  // Sound
  {
    kind: 'range',
    key: CLIENT_SETTING_KEYS.SOUND_VOLUME,
    labelI18nKey: 'client_settings.sound_volume',
    min: 0,
    max: 1,
    step: 0.01,
    valueFormat: 'fixed2',
    testSound: true,
  },

  { kind: 'hr' },

  // Labels
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS,
    labelI18nKey: 'client_settings.show_unit_labels',
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_UNIT_LABEL_TYPE,
    labelI18nKey: 'client_settings.show_unit_label_type',
    indent: true,
    disabled: () => !settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS],
  },

  { kind: 'hr' },

  // Sliders
  {
    kind: 'range',
    key: CLIENT_SETTING_KEYS.OPACITY_UNIT,
    labelI18nKey: 'client_settings.opacity_unit',
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  {
    kind: 'range',
    key: CLIENT_SETTING_KEYS.SIZE_UNIT,
    labelI18nKey: 'client_settings.size_unit',
    min: 0.5,
    max: 2,
    step: 0.05,
    valueFormat: 'fixed2',
  },

  { kind: 'hr' },

  // Other toggles
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP,
    labelI18nKey: 'client_settings.show_hp_unit_on_map',
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_UNIT_MODIFICATORS,
    labelI18nKey: 'client_settings.show_unit_modificators',
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_UNIT_VISION,
    labelI18nKey: 'client_settings.show_unit_vision',
    disabled: () => !!settings[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP],
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_ONLY_SELECTED,
    labelI18nKey: 'client_settings.show_unit_vision_only_selected',
    indent: true,
    disabled: () => !settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION],
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST,
    labelI18nKey: 'client_settings.show_unit_vision_forest_raycast',
    indent: true,
    disabled: () => !settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION],
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_FOREST_MAP,
    labelI18nKey: 'client_settings.forest_map',
    adminOnly: true,
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP,
    labelI18nKey: 'client_settings.height_map',
    adminOnly: true,
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.SHOW_WEATHER_SHADERS,
    labelI18nKey: 'client_settings.show_weather_shaders',
  },
  {
    kind: 'checkbox',
    key: CLIENT_SETTING_KEYS.ENABLE_PERFORMANCE_DEBUG,
    labelI18nKey: 'client_settings.performance_debug',
  },
]

function setLang(lang: 'ru' | 'en') {
  if (route.params.locale === lang) return

  router.push({
    name: route.name!,
    params: {
      ...route.params,
      locale: lang
    },
    query: route.query
  })
  locale.value = lang
}

/**
 * boolean
 */
function toggleBool(key: ClientSettingKey) {
  settings[key] = !settings[key]
}

function setCanvasThemeClass(isDark: unknown) {
  document
    .querySelector('canvas.map-canvas')
    ?.classList.toggle('dark', !!isDark)
}

/**
 * number
 */
function setNumberFromEvent(key: ClientSettingKey, e: Event) {
  settings[key] = Number((e.target as HTMLInputElement).value)
}

function togglePanel(e: MouseEvent) {
  e.stopPropagation()
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function playTestSound() {
  const messageSound = new Audio('/assets/sounds/message.wav')
  messageSound.volume = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SOUND_VOLUME]
  messageSound.play().catch(() => {})
}

onMounted(() => {
  window.addEventListener('click', close)
})

onUnmounted(() => {
  window.removeEventListener('click', close)
})

watch(
  () => settings[CLIENT_SETTING_KEYS.DARK_THEME],
  (isDark) => setCanvasThemeClass(isDark),
  { immediate: true }
)
</script>


<template>
  <!-- Кнопка -->
  <button
    class="settings-button no-select"
    @click="togglePanel"
  >
    ⚙️
  </button>

  <!-- Панель -->
  <div
    v-if="isOpen"
    class="client-settings"
    @click.stop
  >
    <h3 class="title">
      {{ t('client_settings.title') }}
    </h3>

    <div class="setting column">
      <span>{{ t('client_settings.language') }}</span>

      <div style="display: flex; gap: 6px;">
        <button
          class="lang-btn"
          :class="{ active: route.params.locale === 'ru' }"
          @click="setLang('ru')"
        >
          RU
        </button>

        <button
          class="lang-btn"
          :class="{ active: route.params.locale === 'en' }"
          @click="setLang('en')"
        >
          EN
        </button>
      </div>
    </div>

    <template v-for="(item, idx) in uiDef" :key="`${item.kind}-${'key' in item ? item.key : idx}`">
      <hr v-if="item.kind === 'hr'" />

      <label
        v-else-if="item.kind === 'checkbox' && (!item.adminOnly || isAdmin)"
        class="setting"
        :class="{ indent: item.indent }"
      >
        <input
          type="checkbox"
          :checked="!!settings[item.key]"
          :disabled="item.disabled?.() ?? false"
          @change="toggleBool(item.key)"
        />
        {{ t(item.labelI18nKey) }}
      </label>

      <div v-else-if="item.kind === 'range'" class="setting column">
        <span>
          {{ t(item.labelI18nKey) }}:
          <b>
            {{
              item.valueFormat === 'fixed2'
                ? Number(settings[item.key] ?? 1).toFixed(2)
                : settings[item.key]
            }}
          </b>
        </span>

        <input
          type="range"
          :min="item.min"
          :max="item.max"
          :step="item.step"
          :value="settings[item.key] ?? 1"
          @input="setNumberFromEvent(item.key, $event)"
        />

        <button
          v-if="item.testSound"
          class="sound-test-button"
          @click="playTestSound"
          :disabled="settings[CLIENT_SETTING_KEYS.SOUND_VOLUME] === 0"
        >
          🔊 {{ t('client_settings.test_sound') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings-button {
  position: absolute;
  top: 16px;
  right: 16px;

  pointer-events: auto;
  cursor: pointer;

  border: 1px solid #334155;
  border-radius: 8px;
  background: #020617cc;
  color: white;

  padding: 6px 10px;
  font-size: 16px;
}

.settings-button:hover {
  background: #020617cc;
}

.client-settings {
  position: absolute;
  top: 56px;
  right: 16px;

  background: #020617e6;
  border: 1px solid #334155;
  border-radius: 10px;

  padding: 12px 16px;
  pointer-events: auto;

  color: white;
  width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 90px);
  overflow: auto;
  z-index: 20;
}

.title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.lang-btn {
  flex: 1;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: transparent;
  color: white;
  cursor: pointer;
  opacity: 0.7;
}

.lang-btn.active {
  opacity: 1;
  border-color: var(--accent);
  color: var(--accent);
}

.setting {
  display: flex;
  align-items: center;
  gap: 8px;

  font-size: 13px;
  cursor: pointer;
  margin-bottom: 6px;
}

.setting.column {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.setting.indent {
  margin-left: 20px;
  opacity: 0.9;
}

input[type="range"] {
  width: 100%;
}

hr {
  border: none;
  border-top: 1px solid #334155;
  margin: 8px 0;
}

.sound-test-button {
  margin-top: 6px;
  padding: 4px 8px;

  font-size: 12px;
  cursor: pointer;

  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: white;
}

.sound-test-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

</style>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  CLIENT_SETTING_KEYS,
  type ClientSettingKey,
} from '@/enums/clientSettingsKeys'

const { t } = useI18n()
import { reactive } from 'vue'


const settings = reactive(window.CLIENT_SETTINGS)

const isOpen = ref(false)

/**
 * boolean
 */
function toggleBool(key: ClientSettingKey) {
  settings[key] = !settings[key]
  if (key === CLIENT_SETTING_KEYS.DARK_THEME) {
    document.querySelector('canvas.map-canvas')?.classList.toggle('dark', settings[key]);
  }
}
document.querySelector('canvas.map-canvas')?.classList.toggle('dark', settings[CLIENT_SETTING_KEYS.DARK_THEME]);

/**
 * number
 */
function setNumber(key: ClientSettingKey, value: number) {
  settings[key] = value
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
  messageSound.play();
}

onMounted(() => {
  window.addEventListener('click', close)
})

onUnmounted(() => {
  window.removeEventListener('click', close)
})
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

    <!-- DARK THEME -->
    <label class="setting">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.DARK_THEME]"
        @change="toggleBool(CLIENT_SETTING_KEYS.DARK_THEME)"
      />
      {{ t('client_settings.dark_theme') }}
    </label>

    <hr />

    <!-- SOUND VOLUME -->
    <div class="setting column">
      <span>
        {{ t('client_settings.sound_volume') }}:
        <b>{{ settings[CLIENT_SETTING_KEYS.SOUND_VOLUME]?.toFixed(2) }}</b>
      </span>

      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="settings[CLIENT_SETTING_KEYS.SOUND_VOLUME] ?? 1"
        @input="setNumber(
      CLIENT_SETTING_KEYS.SOUND_VOLUME,
      Number(($event.target as HTMLInputElement).value)
    )"
      />

      <!-- TEST BUTTON -->
      <button
        class="sound-test-button"
        @click="playTestSound"
        :disabled="settings[CLIENT_SETTING_KEYS.SOUND_VOLUME] === 0"
      >
        🔊 {{ t('client_settings.test_sound') }}
      </button>
    </div>

    <hr />

    <!-- LABELS -->
    <label class="setting">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS)"
      />
      {{ t('client_settings.show_unit_labels') }}
    </label>

    <label class="setting indent">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABEL_TYPE]"
        :disabled="!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_LABELS]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_UNIT_LABEL_TYPE)"
      />
      {{ t('client_settings.show_unit_label_type') }}
    </label>

    <hr />

    <!-- OPACITY -->
    <div class="setting column">
      <span>
        {{ t('client_settings.opacity_unit') }}:
        <b>{{ settings[CLIENT_SETTING_KEYS.OPACITY_UNIT] }}</b>
      </span>

      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        :value="settings[CLIENT_SETTING_KEYS.OPACITY_UNIT] ?? 1"
        @input="setNumber(
          CLIENT_SETTING_KEYS.OPACITY_UNIT,
          Number(($event.target as HTMLInputElement).value)
        )"
      />
    </div>

    <!-- SIZE -->
    <div class="setting column">
      <span>
        {{ t('client_settings.size_unit') }}:
        <b>{{ settings[CLIENT_SETTING_KEYS.SIZE_UNIT]?.toFixed(2) }}</b>
      </span>

      <input
        type="range"
        min="0.5"
        max="2"
        step="0.05"
        :value="settings[CLIENT_SETTING_KEYS.SIZE_UNIT] ?? 1"
        @input="setNumber(
          CLIENT_SETTING_KEYS.SIZE_UNIT,
          Number(($event.target as HTMLInputElement).value)
        )"
      />
    </div>

    <hr />

    <!-- HP -->
    <label class="setting">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_HP_UNIT_ON_MAP)"
      />
      {{ t('client_settings.show_hp_unit_on_map') }}
    </label>

    <!-- VISION -->
    <label class="setting">
      <input
        type="checkbox"
        :disabled="!!settings[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_UNIT_VISION)"
      />
      {{ t('client_settings.show_unit_vision') }}
    </label>

    <label class="setting indent">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST]"
        :disabled="!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST)"
      />
      {{ t('client_settings.show_unit_vision_forest_raycast') }}
    </label>

    <!-- FOREST MAP -->
    <label class="setting">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_FOREST_MAP]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_FOREST_MAP)"
      />
      {{ t('client_settings.forest_map') }}
    </label>

    <!-- HEIGHT MAP -->
    <label class="setting">
      <input
        type="checkbox"
        :checked="!!settings[CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP]"
        @change="toggleBool(CLIENT_SETTING_KEYS.SHOW_HEIGHT_MAP)"
      />
      {{ t('client_settings.height_map') }}
    </label>
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
  min-width: 260px;
  z-index: 20;
}

.title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
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

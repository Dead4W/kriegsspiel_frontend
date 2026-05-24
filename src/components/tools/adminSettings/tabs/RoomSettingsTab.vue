<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROOM_SETTINGS } from '@/game/roomSettings'

type RoomRuleSetting = {
  key: string
  label: string
  description?: string
  type: 'boolean' | 'string'
  value: unknown
}

const { t } = useI18n()

const roomSettingsRef = computed<Record<string, unknown>>(
  () => (window.ROOM_SETTINGS as Record<string, unknown>) || {}
)

const roomRulesSettings = computed<RoomRuleSetting[]>(() =>
  ROOM_SETTINGS.map((setting) => ({
    key: setting.key,
    label: t(setting.i18nLabel),
    description: setting.i18nDescription ? t(setting.i18nDescription) : '',
    type: setting.type,
    value: roomSettingsRef.value[setting.key],
  }))
)

function displayReadonlyValue(value: unknown) {
  if (value === null || value === undefined) {
    return t('tools.admin.settings_modal.room.not_set')
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : t('tools.admin.settings_modal.room.not_set')
  }
  return String(value)
}
</script>

<template>
  <section class="room-tab">
    <div class="settings-group">
      <h3>{{ t('tools.admin.settings_modal.room.rules_group') }}</h3>
      <div
        v-for="setting in roomRulesSettings"
        :key="setting.key"
        class="readonly-setting"
      >
        <div v-if="setting.type === 'boolean'" class="readonly-bool">
          <div class="readonly-meta">
            <div class="readonly-label">{{ setting.label }}</div>
            <small v-if="setting.description">{{ setting.description }}</small>
          </div>
          <span
            class="bool-badge"
            :class="Boolean(setting.value) ? 'on' : 'off'"
          >
            {{ Boolean(setting.value) ? t('tools.admin.settings_modal.room.bool_on') : t('tools.admin.settings_modal.room.bool_off') }}
          </span>
        </div>

        <div v-else class="readonly-field">
          <label class="readonly-label">{{ setting.label }}</label>
          <input
            type="text"
            :value="displayReadonlyValue(setting.value)"
            readonly
            disabled
          >
          <small v-if="setting.description">{{ setting.description }}</small>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.room-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-group {
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.35);
}

.settings-group h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #93c5fd;
}

.readonly-setting + .readonly-setting {
  margin-top: 8px;
}

.readonly-bool {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.readonly-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.readonly-label {
  font-size: 12px;
  color: #cbd5e1;
}

.readonly-meta small,
.readonly-field small {
  color: #94a3b8;
  font-size: 11px;
}

.bool-badge {
  min-width: 46px;
  text-align: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;
}

.bool-badge.on {
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(22, 101, 52, 0.35);
}

.bool-badge.off {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.45);
  background: rgba(127, 29, 29, 0.32);
}

.readonly-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.readonly-field input {
  width: 100%;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 8px;
  color: #94a3b8;
  background: rgba(2, 6, 23, 0.75);
}
</style>

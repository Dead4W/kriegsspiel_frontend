<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Team } from '@/enums/teamKeys'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys'

const props = defineProps<{
  team: Team.RED | Team.BLUE
}>()

defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()

const teamLabel = computed(() => {
  if (props.team === Team.RED) {
    return window.ROOM_SETTINGS?.[ROOM_SETTING_KEYS.RED_TEAM_NAME] || Team.RED
  }
  return window.ROOM_SETTINGS?.[ROOM_SETTING_KEYS.BLUE_TEAM_NAME] || Team.BLUE
})

const teamClass = computed(() => (props.team === Team.RED ? 'team-red' : 'team-blue'))
</script>

<template>
  <div class="planning-entry-modal-overlay">
    <div class="planning-entry-modal">
      <h2>{{ t('planningEntryModal.title') }}</h2>
      <p>
        {{ t('planningEntryModal.team_info') }}
        <span :class="teamClass">{{ teamLabel }}</span>
      </p>
      <button type="button" @click="$emit('close')">
        {{ t('planningEntryModal.close') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.planning-entry-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.planning-entry-modal {
  width: min(460px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid #334155;
  border-radius: 12px;
  background: #020617f2;
  color: #fff;
  text-align: center;
}

.planning-entry-modal h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

.planning-entry-modal p {
  margin: 0 0 16px;
  color: #cbd5e1;
}

.team-red {
  color: #ef4444;
  font-weight: 700;
}

.team-blue {
  color: #60a5fa;
  font-weight: 700;
}

.planning-entry-modal button {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px 16px;
  background: #0f172a;
  color: #fff;
  cursor: pointer;
}
</style>

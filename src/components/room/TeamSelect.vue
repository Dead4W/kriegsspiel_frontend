<script setup lang="ts">
import { Team } from '@/enums/teamKeys'
import { useI18n } from 'vue-i18n'
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import { createClientSettings } from '@/enums/clientSettingsKeys'
import { onMounted, watch } from 'vue'

const { t } = useI18n()

const props = defineProps<{
  roomId: string
  /** if provided — auto-select without showing UI */
  autoTeam?: Team | null
}>()

const emit = defineEmits<{
  (e: 'select', team: Team): void
}>()

const teams = [
  Team.ADMIN,
  Team.BLUE,
  Team.RED,
]

function getOrCreateClientId(roomId: string) {
  const key = `client_id_${roomId}`
  let id = localStorage.getItem(key)
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as Crypto).randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`
    localStorage.setItem(key, id)
  }
  return id
}

function onTeamSelected(team: Team) {
  window.CLIENT_SETTINGS = createClientSettings()
  window.PLAYER.team = team
  window.CLIENT_ID = getOrCreateClientId(props.roomId)
  emit('select', team)
}

function getTeamTitle(team: Team) {
  if (team === Team.RED && window.ROOM_SETTINGS[ROOM_SETTING_KEYS.RED_TEAM_NAME]) {
    return window.ROOM_SETTINGS[ROOM_SETTING_KEYS.RED_TEAM_NAME];
  }

  if (team === Team.BLUE && window.ROOM_SETTINGS[ROOM_SETTING_KEYS.BLUE_TEAM_NAME]) {
    return window.ROOM_SETTINGS[ROOM_SETTING_KEYS.BLUE_TEAM_NAME];
  }

  return t(`team.${team}`);
}

onMounted(() => {
  if (props.autoTeam != null) {
    onTeamSelected(props.autoTeam)
  }
})

watch(
  () => props.autoTeam,
  (team) => {
    if (team != null) onTeamSelected(team)
  }
)

</script>

<template>
  <div v-if="autoTeam == null" class="team-select">
    <h2>{{ t('select_team') }}</h2>

    <div class="buttons">
      <button
        v-for="team in teams"
        :key="team"
        @click="onTeamSelected(team)"
        :class="`team-${team}`"
      >
        {{ getTeamTitle(team) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.team-select {
  position: fixed;
  inset: 0;
  background: #020617;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
}

.buttons {
  display: flex;
  gap: 1rem;
}

button {
  padding: 0.8rem 1.6rem;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  border: 1px solid var(--secondary);
}

button:hover {
  border: 1px solid var(--accent);
}

.team-red, .team-red:hover {
  background: #ef4444;
  border: none;
}

.team-blue, .team-blue:hover {
  background: #3a82f6;
  border: none;
}


</style>

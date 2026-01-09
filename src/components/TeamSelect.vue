<script setup lang="ts">
import { Team } from '@/enums/teamKeys'
import { useI18n } from 'vue-i18n'
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'select', team: Team): void
}>()

const teams = [
  Team.ADMIN,
  Team.BLUE,
  Team.RED,
]

function getTeamTitle(team: Team) {
  if (team === Team.RED && window.ROOM_SETTINGS[ROOM_SETTING_KEYS.RED_TEAM_NAME]) {
    return window.ROOM_SETTINGS[ROOM_SETTING_KEYS.RED_TEAM_NAME];
  }

  if (team === Team.BLUE && window.ROOM_SETTINGS[ROOM_SETTING_KEYS.BLUE_TEAM_NAME]) {
    return window.ROOM_SETTINGS[ROOM_SETTING_KEYS.BLUE_TEAM_NAME];
  }

  return t(`team.${team}`);
}

</script>

<template>
  <div class="team-select">
    <h2>{{ t('select_team') }}</h2>

    <div class="buttons">
      <button
        v-for="team in teams"
        :key="team"
        @click="emit('select', team)"
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

.team-red {
  background: #ef4444;
}

.team-blue {
  background: #3a82f6;
}

</style>

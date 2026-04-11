<script setup lang="ts">
import { Team } from '@/enums/teamKeys'
import { useI18n } from 'vue-i18n'
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import { createClientSettings } from '@/enums/clientSettingsKeys'
import { computed, onMounted, watch } from 'vue'
import type { RoomMapInfo } from '@/structures/room'

const { t } = useI18n()

const props = defineProps<{
  roomId: string
  roomMaps?: RoomMapInfo[]
  /** if provided — auto-select without showing UI */
  autoTeam?: Team | null
}>()

const emit = defineEmits<{
  (e: 'select', payload: { team: Team; userId: number | null }): void
}>()

const selectableRoomMaps = computed(() => props.roomMaps ?? [])

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

function normalizeUserId(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getDefaultUserIdForTeam(team: Team): number | null {
  const currentUserId = normalizeUserId(window.PLAYER?.id)
  if (currentUserId == null) return null

  const existsInRoomMaps = (props.roomMaps ?? []).some(
    roomMap => roomMap.team === team && roomMap.user?.id === currentUserId,
  )

  return existsInRoomMaps ? currentUserId : null
}

function onTeamSelected(team: Team, userId: number | null = null) {
  window.CLIENT_SETTINGS = createClientSettings()
  window.PLAYER.team = team
  window.CLIENT_ID = getOrCreateClientId(props.roomId)
  emit('select', { team, userId })
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
    onTeamSelected(props.autoTeam, getDefaultUserIdForTeam(props.autoTeam))
  }
})

watch(
  () => props.autoTeam,
  (team) => {
    if (team != null) onTeamSelected(team, getDefaultUserIdForTeam(team))
  }
)

</script>

<template>
  <div v-if="autoTeam == null" class="team-select">
    <h2>{{ t('select_team') }}</h2>

    <div class="buttons">
      <button
        v-for="roomMap in selectableRoomMaps"
        :key="roomMap.room_map_id"
        @click="onTeamSelected(roomMap.team, roomMap.user?.id ?? null)"
        :class="`team-${roomMap.team}`"
      >
        {{ getTeamTitle(roomMap.team) }}
        <template v-if="roomMap.user">
          : {{ roomMap.user.name || 'John Doe' }}
        </template>
      </button>
    </div>

    <div v-if="selectableRoomMaps.length === 0" class="empty">
      No room maps available
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
  padding: 1.5rem;
  box-sizing: border-box;
}

.buttons {
  width: min(980px, 100%);
  max-height: min(65vh, 720px);
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  padding: 0.25rem;
}

.empty {
  color: var(--text-muted);
}

button {
  padding: 0.75rem 1rem;
  min-height: 48px;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  border: 1px solid var(--secondary);
  white-space: normal;
  word-break: break-word;
  text-align: left;
  line-height: 1.25;
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

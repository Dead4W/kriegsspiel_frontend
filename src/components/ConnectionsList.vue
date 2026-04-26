<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {Team} from '@/enums/teamKeys.ts'
import {RoomGameStage} from "@/enums/roomStage.ts";
import type {ConnectionInfo} from '@/engine/types/connectionTypes.ts'
import type {PlayerReadyInfo} from '@/engine/types/connectionTypes.ts'

const props = defineProps<{
  connections: ConnectionInfo[]
  stage: RoomGameStage
}>()

const { t } = useI18n()

function getConnectionTeamLabel(team: string) {
  if (team === Team.RED) {
    return window.ROOM_SETTINGS.redTeamName ?? t(`team.${Team.RED}`)
  }
  if (team === Team.BLUE) {
    return window.ROOM_SETTINGS.blueTeamName ?? t(`team.${Team.BLUE}`)
  }
  if (team === Team.SPECTATOR) {
    return t(`team.${Team.SPECTATOR}`)
  }
  if (team === Team.ADMIN) {
    return t(`team.${Team.ADMIN}`)
  }
  return team
}

function getConnectionTeamClass(team: string) {
  if (team === Team.RED) return 'team-red'
  if (team === Team.BLUE) return 'team-blue'
  if (team === Team.ADMIN) return 'team-admin'
  if (team === Team.SPECTATOR) return 'team-spectator'
  return 'team-unknown'
}

function isPlayerTeam(team: string) {
  return team === Team.RED || team === Team.BLUE
}

type DisplayConnection = Omit<ConnectionInfo, 'id'> & {
  id: number | string
  offline?: boolean
}

const displayedConnections = computed<DisplayConnection[]>(() => {
  const onlineConnections: DisplayConnection[] = props.connections.map((connection) => ({
    ...connection,
    offline: false,
  }))

  const onlinePlayerKeys = new Set(
    props.connections
      .filter(
        (connection) =>
          isPlayerTeam(connection.team)
          && typeof connection.user_id === 'number'
          && connection.user_id > 0
      )
      .map((connection) => `${connection.team}:${connection.user_id}`)
  )

  const offlineByPlayerKey = new Map<string, DisplayConnection>()
  const readyStates = window.ROOM_WORLD.playerReadyStates.value as PlayerReadyInfo[]
  for (const readyState of readyStates) {
    if (!isPlayerTeam(readyState.team)) continue
    const key = `${readyState.team}:${readyState.user_id}`
    if (onlinePlayerKeys.has(key)) continue
    if (offlineByPlayerKey.has(key)) {
      const prev = offlineByPlayerKey.get(key)!
      offlineByPlayerKey.set(key, {
        ...prev,
        is_ready: readyState.is_ready,
        user: readyState.user ?? prev.user,
      })
      continue
    }
    offlineByPlayerKey.set(key, {
      id: `offline-${key}`,
      team: readyState.team,
      user_id: readyState.user_id,
      user: readyState.user ?? `#${readyState.user_id}`,
      is_ready: readyState.is_ready,
      offline: true,
    })
  }

  return [
    ...onlineConnections,
    ...offlineByPlayerKey.values(),
  ]
})
</script>

<template>
  <div class="connections-panel">
    <div class="connections-title">
      Connections ({{ displayedConnections.length }})
    </div>
    <div class="connections-list">
      <div v-if="!displayedConnections.length" class="connections-empty">
        No active connections
      </div>
      <div
        v-for="connection in displayedConnections"
        :key="connection.id"
        class="connection-item"
        :class="getConnectionTeamClass(connection.team)"
      >
        <div class="connection-main">
          <span class="connection-user">{{ connection.user ?? `#${connection.id}` }}</span>
          <span
            v-if="connection.offline"
            class="connection-status-offline"
          >
            {{ t('connections.offline') }}
          </span>
          <span
            v-if="props.stage === RoomGameStage.PLANNING && isPlayerTeam(connection.team) && typeof connection.is_ready === 'boolean'"
            class="connection-ready"
            :class="{ active: connection.is_ready }"
          >
            {{ connection.is_ready ? t('turn_timer.ready_on') : t('connections.not_ready') }}
          </span>
        </div>
        <span class="connection-team" :class="getConnectionTeamClass(connection.team)">
          {{ getConnectionTeamLabel(connection.team) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.connections-panel {
  width: 100%;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 8px;
}

.connections-title {
  padding: 8px 10px;
  border-bottom: 1px solid #334155;
  font-size: 12px;
  font-weight: 700;
}

.connections-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 220px;
}

.connections-empty {
  padding: 10px;
  font-size: 12px;
  color: #94a3b8;
}

.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.6);
  font-size: 12px;
  border-left: 3px solid transparent;
}

.connection-item:last-child {
  border-bottom: none;
}

.connection-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.connection-user {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e2e8f0;
}

.connection-ready {
  font-size: 11px;
  border: 1px solid #475569;
  border-radius: 999px;
  padding: 1px 6px;
  color: #cbd5e1;
  background: #0f172a;
  white-space: nowrap;
}

.connection-ready.active {
  border-color: #16a34a;
  color: #bbf7d0;
}

.connection-status-offline {
  font-size: 11px;
  border: 1px solid #be123c;
  border-radius: 999px;
  padding: 1px 6px;
  color: #fecdd3;
  background: rgba(136, 19, 55, 0.25);
  white-space: nowrap;
}

.connection-team {
  font-weight: 600;
  white-space: nowrap;
}

.connection-item.team-red {
  border-left-color: #ef4444;
}

.connection-item.team-blue {
  border-left-color: #3b82f6;
}

.connection-item.team-admin {
  border-left-color: #f59e0b;
}

.connection-item.team-spectator {
  border-left-color: #a855f7;
}

.connection-team.team-red {
  color: #fca5a5;
}

.connection-team.team-blue {
  color: #93c5fd;
}

.connection-team.team-admin {
  color: #fcd34d;
}

.connection-team.team-spectator {
  color: #d8b4fe;
}

.connection-team.team-unknown {
  color: #94a3b8;
}
</style>

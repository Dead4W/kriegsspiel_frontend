<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {Team} from '@/enums/teamKeys.ts'
import type {ConnectionInfo} from '@/engine/types/connectionTypes.ts'

defineProps<{
  connections: ConnectionInfo[]
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
</script>

<template>
  <div class="connections-panel">
    <div class="connections-title">
      Connections ({{ connections.length }})
    </div>
    <div class="connections-list">
      <div v-if="!connections.length" class="connections-empty">
        No active connections
      </div>
      <div
        v-for="connection in connections"
        :key="connection.id"
        class="connection-item"
        :class="getConnectionTeamClass(connection.team)"
      >
        <span class="connection-user">{{ connection.user ?? `#${connection.id}` }}</span>
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
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.6);
  font-size: 12px;
  border-left: 3px solid transparent;
}

.connection-item:last-child {
  border-bottom: none;
}

.connection-user {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e2e8f0;
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

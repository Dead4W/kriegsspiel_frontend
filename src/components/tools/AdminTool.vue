<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {RoomGameStage} from "@/enums/roomStage.ts";
import {Team} from "@/enums/teamKeys.ts";
import {computed, onMounted, onUnmounted, ref} from "vue";
import ConnectionsList from '@/components/ConnectionsList.vue'
import ChartTool from '@/components/tools/ChartTool.vue'
import BattleLog from '@/components/BattleLog.vue'

const { t } = useI18n()

const stage = ref(window.ROOM_WORLD.stage);
const copiedTeam = ref<Team | null>(null)
const connections = window.ROOM_WORLD.connections
const isChartOpen = ref(false)
const isLogsOpen = ref(false)
const readyStats = computed(() => window.ROOM_WORLD.getPlayerReadyStats())
const offlinePlayersCount = computed(() => {
  const onlineKeys = new Set(
    window.ROOM_WORLD.connections.value
      .filter(
        (connection) =>
          (connection.team === Team.RED || connection.team === Team.BLUE)
          && typeof connection.user_id === 'number'
          && connection.user_id > 0
      )
      .map((connection) => `${connection.team}:${connection.user_id}`)
  )
  let offlineCount = 0
  for (const player of window.ROOM_WORLD.playerReadyStates.value) {
    if (player.team !== Team.RED && player.team !== Team.BLUE) continue
    const key = `${player.team}:${player.user_id}`
    if (!onlineKeys.has(key)) {
      offlineCount++
    }
  }
  return offlineCount
})
const startWarBlockedReason = computed(() => {
  if (stage.value !== RoomGameStage.PLANNING) return ''
  const {ready, total} = readyStats.value
  if (total <= 0) {
    return t('tools.admin.start_war_disabled_no_players')
  }
  return ''
})
const startWarWarningReason = computed(() => {
  if (stage.value !== RoomGameStage.PLANNING) return ''
  const {ready, total} = readyStats.value
  if (total <= 0) return ''
  const offline = offlinePlayersCount.value
  if (ready < total && offline > 0) {
    return t('tools.admin.start_war_warning_not_ready_offline', { ready, total, offline })
  }
  if (ready < total) {
    return t('tools.admin.start_war_warning_not_ready', { ready, total })
  }
  if (offline > 0) {
    return t('tools.admin.start_war_warning_offline', { offline })
  }
  return ''
})
const isStartWarDisabled = computed(() => startWarBlockedReason.value.length > 0)
const isStartWarWarning = computed(() => startWarWarningReason.value.length > 0)
const startWarHintText = computed(() => {
  if (isStartWarDisabled.value) return startWarBlockedReason.value
  if (isStartWarWarning.value) return startWarWarningReason.value
  return ''
})

/* ================= actions ================= */

function startWar() {
  if (isStartWarDisabled.value) return
  if (isStartWarWarning.value) {
    const confirmed = window.confirm(
      t('tools.admin.start_war_warning_confirm', {
        ...readyStats.value,
        offline: offlinePlayersCount.value,
      })
    )
    if (!confirmed) return
  }
  window.ROOM_WORLD.setStage(RoomGameStage.WAR);
}

function endWar() {
  window.ROOM_WORLD.setStage(RoomGameStage.END);
}

function sync() {
  stage.value = window.ROOM_WORLD.stage;
}

function copyTeamLink(team: Team) {
  const host = window.location.origin;
  const roomUUID = window.ROOM_WORLD.id;

  const keyName = `${team}_key` as keyof typeof window.ROOM_KEYS;
  const key = window.ROOM_KEYS[keyName];

  if (!key) return;

  const link = `${host}/room/${roomUUID}/key/${key}?team=${team}`;

  navigator.clipboard.writeText(link).then(() => {
    copiedTeam.value = team;

    setTimeout(() => {
      copiedTeam.value = null;
    }, 2000);
  });
}

function openChart() {
  isChartOpen.value = true
}

function closeChart() {
  isChartOpen.value = false
}

function toggleLogs() {
  isLogsOpen.value = !isLogsOpen.value
}

/* LIFE CYCLE */

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
  sync()
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})

</script>

<template>
  <div class="admin-panel">
    <h3>{{ t('tools.admin.title') }}</h3>

    <button
      class="danger"
      :class="{ warning: isStartWarWarning }"
      @click="startWar"
      v-if="stage === RoomGameStage.PLANNING"
      :disabled="isStartWarDisabled"
      :title="startWarHintText || undefined"
    >
      ⚔️ {{ t('tools.admin.start_war') }}
    </button>
    <div
      v-if="stage === RoomGameStage.PLANNING && isStartWarWarning"
      class="hint warning"
    >
      ⚠️ {{ startWarWarningReason }}
      <br>
      {{ t('tools.admin.start_war_warning_hint') }}
    </div>
    <div
      v-else-if="stage === RoomGameStage.PLANNING && isStartWarDisabled"
      class="hint blocked"
    >
      {{ startWarBlockedReason }}
    </div>

    <button class="danger" @click="endWar" v-if="stage === RoomGameStage.WAR">
      ⚔️ {{ t('tools.admin.end_war') }}
    </button>

    <button @click="copyTeamLink(Team.ADMIN)">
      <span v-if="copiedTeam === Team.ADMIN">✅ {{ t('copied') }}</span>
      <span v-else>🔗 {{ t('tools.admin.copy_team_link') }} {{ t('team.admin') }}</span>
    </button>

    <button @click="copyTeamLink(Team.RED)">
      <span v-if="copiedTeam === Team.RED">✅ {{ t('copied') }}</span>
      <span v-else>
        🔗 {{ t('tools.admin.copy_team_link') }}
        <span style="color:#ef4444">{{ t('team.red') }}</span>
      </span>
    </button>

    <button @click="copyTeamLink(Team.BLUE)">
      <span v-if="copiedTeam === Team.BLUE">✅ {{ t('copied') }}</span>
      <span v-else>
        🔗 {{ t('tools.admin.copy_team_link') }}
        <span style="color:#3a82f6">{{ t('team.blue') }}</span>
      </span>
    </button>

    <button @click="openChart">
      📈 {{ t('tools.chart') }}
    </button>

    <button @click="toggleLogs">
      📜 {{ t('tools.logs.title') }}
    </button>

    <ConnectionsList :connections="connections" :stage="stage" />

    <BattleLog v-if="isLogsOpen" />
    <ChartTool v-if="isChartOpen" @close="closeChart" />
  </div>
</template>

<style scoped>
.admin-panel {
  position: absolute;
  top: 64px;
  left: 16px;

  width: 340px;
  padding: 12px;

  background: #020617ee;
  border: 1px solid #334155;
  border-radius: 10px;

  color: white;
  pointer-events: auto;
}

h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

button {
  width: 100%;
  margin-bottom: 8px;
  padding: 6px;

  border-radius: 8px;
  border: 1px solid #334155;
  background: #020617;
  color: white;

  cursor: pointer;
}

button:hover {
  background: rgba(21, 32, 83, 0.8);
}

button.danger {
  background: #7f1d1d;
  border-color: #991b1b;
}

button.danger.warning {
  background: #b45309;
  border-color: #f59e0b;
  color: #fff7ed;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  margin: -2px 0 8px;
  font-size: 12px;
}

.hint.warning {
  color: #fde68a;
  background: rgba(180, 83, 9, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.5);
  border-radius: 8px;
  padding: 6px 8px;
}

.hint.blocked {
  color: #fca5a5;
}
</style>

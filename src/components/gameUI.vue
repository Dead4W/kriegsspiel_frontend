<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref} from 'vue'
import SpawnTool from '@/components/tools/SpawnTool.vue'
import RulerTool from '@/components/tools/RulerTool.vue'
import {useI18n} from 'vue-i18n'
import SelectionPanel from "@/components/SelectionPanel.vue";
import ClientSettingsPanel from "@/components/ClientSettingsPanel.vue";
import KringChat from "@/components/KringChat.vue";
import TurnTimer from "@/components/TurnTimer.vue";
import {Team} from "@/enums/teamKeys.ts";
import AdminTool from "@/components/tools/AdminTool.vue";
import ForcesBar from "@/components/ForcesBar.vue";
import NotificationsPanel from "@/components/NotificationsPanel.vue";
import BattleLog from "@/components/BattleLog.vue";
import ChartTool from "@/components/tools/ChartTool.vue";

const { t } = useI18n()

enum Tools {
  SPAWN = 'spawn',
  RULER = 'ruler',
  ADMIN = 'admin',
  LOGS = 'logs',
  CHART = 'chart',
}

const activeTool = ref<Tools | null>(null)

const world = computed(() => window.ROOM_WORLD)

function toggle(e: MouseEvent, tool: Tools) {
  e.preventDefault()
  e.stopPropagation()
  activeTool.value = activeTool.value === tool ? null : tool
}

function isAdmin() {
  return window.PLAYER.team === Team.ADMIN;
}

function onKeydown(e: KeyboardEvent) {
  nextTick();
  if (e.key === 'Escape') {
    activeTool.value = null
  }
}

function close() {
  activeTool.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="krig-ui">
    <ForcesBar v-if="isAdmin()"/>

    <div class="top-bar no-select">
      <TurnTimer />
    </div>

    <!-- Панель инструментов -->
    <div class="toolbar no-select">
      <button
        v-if="isAdmin()"
        :class="{ active: activeTool === Tools.LOGS}"
        @pointerdown.stop.prevent
        @click="toggle($event, Tools.LOGS)"
      >
        📜 {{ t('tools.logs.title') }}
      </button>

      <button
        v-if="isAdmin()"
        :class="{ active: activeTool === Tools.ADMIN }"
        @pointerdown.stop.prevent
        @click="toggle($event, Tools.ADMIN)"
      >
        🛡️ {{ t('team.admin') }}
      </button>

      <button
        v-if="isAdmin()"
        :class="{ active: activeTool === Tools.CHART }"
        @pointerdown.stop.prevent
        @click="toggle($event, Tools.CHART)"
      >
        📈 {{ t('tools.chart') }}
      </button>

      <button
        :class="{ active: activeTool === Tools.SPAWN }"
        @pointerdown.stop.prevent
        @click="toggle($event, Tools.SPAWN)"
      >
        ➕ {{ t('tools.add_unit') }}
      </button>

      <button
        :class="{ active: activeTool === Tools.RULER }"
        @pointerdown.stop.prevent
        @click="toggle($event, Tools.RULER)"
      >
        📏 {{ t('tools.ruler') }}
      </button>
    </div>

    <AdminTool
      v-if="isAdmin() && activeTool === Tools.ADMIN"
      :world="world"
      class="no-select"
    />

    <ChartTool
      v-if="isAdmin() && activeTool === Tools.CHART"
      @close="close"
    />

    <BattleLog
      v-if="isAdmin() && activeTool === Tools.LOGS"
    />

    <!-- Инструменты -->
    <SpawnTool
      v-if="activeTool === Tools.SPAWN"
      :world="world"
      class="no-select"
    />

    <RulerTool
      v-if="activeTool === Tools.RULER"
      :world="world"
      class="no-select"
    />

    <SelectionPanel
      :world="world"
      class="no-select"
    />

    <ClientSettingsPanel />

    <KringChat />

    <NotificationsPanel v-if="isAdmin()"/>
  </div>
</template>

<style scoped>
.krig-ui {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.krig-ui button:focus,
.krig-ui a:focus,
.krig-ui input:focus,
.krig-ui textarea:focus,
.krig-ui select:focus {
  outline: none;
  box-shadow: none;
}

.krig-ui *:focus-visible {
  outline: none;
  box-shadow: none;
}

/* toolbar */
.toolbar {
  position: absolute;
  top: 16px;
  left: 16px;

  display: flex;
  gap: 8px;

  pointer-events: auto;
}

.toolbar button {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #334155;
  background: #020617cc;
  color: white;
  cursor: pointer;
}

.toolbar button.active {
  background: var(--accent);
}
</style>

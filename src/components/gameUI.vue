<script setup lang="ts">
import {computed, type ComputedRef, nextTick, onMounted, onUnmounted, ref} from 'vue'
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
import DemoTool from "@/components/tools/DemoTool.vue";
import {RoomGameStage} from "@/enums/roomStage.ts";

const { t } = useI18n()

enum Tools {
  SPAWN = 'spawn',
  RULER = 'ruler',
  ADMIN = 'admin',
  LOGS = 'logs',
  CHART = 'chart',
}

const activeTool = ref<Tools | null>(null)

const world = ref(window.ROOM_WORLD)
const isEnd = ref(false)

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
  } else if (e.code === 'KeyV') {
    activeTool.value = activeTool.value === Tools.RULER ? null : Tools.RULER
  }
}

function close() {
  activeTool.value = null
}

function sync() {
  world.value = window.ROOM_WORLD
  isEnd.value = world.value.stage === RoomGameStage.END
}

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
  window.addEventListener('keydown', onKeydown)
  sync()
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
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
        v-if="isAdmin() && !isEnd"
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
        v-if="!isEnd"
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
        :title="`${t('hotkey')}: V`"
      >
        📏 {{ t('tools.ruler') }}
      </button>
    </div>

    <DemoTool
      v-if="isAdmin() && isEnd"
      :world="world"
      @close="close"
    />

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
      :isEnd="isEnd"
      class="no-select"
    />

    <ClientSettingsPanel />

    <KringChat />

    <NotificationsPanel v-if="isAdmin() && !isEnd"/>
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

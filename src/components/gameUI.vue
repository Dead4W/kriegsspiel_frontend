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

const { t } = useI18n()

const activeTool = ref<'spawn' | 'ruler' | 'admin' | null>(null)

const world = computed(() => window.ROOM_WORLD)

function toggle(e: MouseEvent, tool: 'spawn' | 'ruler' | 'admin') {
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
        :class="{ active: activeTool === 'admin' }"
        @pointerdown.stop.prevent
        @click="toggle($event, 'admin')"
      >
        🛡️ {{ t('team.admin') }}
      </button>

      <button
        :class="{ active: activeTool === 'spawn' }"
        @pointerdown.stop.prevent
        @click="toggle($event, 'spawn')"
      >
        ➕ {{ t('tools.add_unit') }}
      </button>

      <button
        :class="{ active: activeTool === 'ruler' }"
        @pointerdown.stop.prevent
        @click="toggle($event, 'ruler')"
      >
        📏 {{ t('tools.ruler') }}
      </button>
    </div>

    <AdminTool
      v-if="isAdmin() && activeTool === 'admin'"
      :world="world"
      class="no-select"
    />

    <!-- Инструменты -->
    <SpawnTool
      v-if="activeTool === 'spawn'"
      :world="world"
      class="no-select"
    />

    <RulerTool
      v-if="activeTool === 'ruler'"
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

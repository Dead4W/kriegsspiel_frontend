<script setup lang="ts">
import { computed } from 'vue'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { Team } from '@/enums/teamKeys'
import {UnitEnvironmentState, UnitEnvironmentStateIcon} from '@/engine/units/enums/UnitStates'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/* ================= props / emits ================= */

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'edit'): void
}>()

/* ================= access ================= */

const isAdmin = computed(
  () => window.PLAYER?.team === Team.ADMIN
)

const hasUnits = computed(
  () => props.units.length > 0
)

/* ================= helpers ================= */

const ENV_STATES = Object.values(UnitEnvironmentState)

function hasState(state: UnitEnvironmentState): boolean {
  return props.units.every(u => u.envState.includes(state))
}

function envIcon(state: UnitEnvironmentState) {
  return UnitEnvironmentStateIcon[state]
}

/* ================= actions ================= */

function toggleState(state: UnitEnvironmentState) {
  const setState = !hasState(state);
  for (const u of props.units) {
    if (u.envState.includes(state) !== setState) {
      if (setState) {
        if (!u.envState.includes(state)) {
          u.envState.push(state);
        }
      } else {
        u.envState = u.envState.filter(s => s !== state);
      }
      window.ROOM_WORLD.units.addUnitDirty(u.id);
    }
  }
  emit('edit');
}

function clearEnvStates() {
  for (const u of props.units) {
    u.envState = []
  }

  emit('edit')
}
</script>

<template>
  <div
    v-if="isAdmin && hasUnits"
    class="env-panel"
  >
    <div class="env-title">
      🌿 {{ t('tools.environment_editor') }}
    </div>

    <div class="env-buttons">
      <button
        v-for="state in ENV_STATES"
        :key="state"
        class="env-btn"
        :class="{ active: hasState(state) }"
        @click="toggleState(state)"
      >
        <span class="env-btn-icon" v-if="envIcon(state)">
          {{ envIcon(state) }}
        </span>

        <span class="env-btn-label">
          {{ t(`env.${state}`) }}
        </span>
      </button>
    </div>

    <button
      class="env-btn danger"
      @click="clearEnvStates"
    >
      ✖ {{ t('clear')  }}
    </button>
  </div>
</template>

<style scoped>
.env-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 12px;
  background: #020617ee;
  border-radius: 8px;
  border-top: 1px solid #1e293b;
  pointer-events: auto;
}

.env-title {
  font-size: 10px;
  color: #94a3b8;
}

.env-buttons {
  display: grid;
  grid-template-rows: repeat(3, auto);
  grid-auto-flow: column;
  gap: 4px;
}

.env-btn {
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #cbd5f5;
  cursor: pointer;
}

.env-btn.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
  color: #e5e7eb;
}

.env-btn.danger {
  color: #f87171;
}

.env-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.env-btn-icon {
  font-size: 11px;
  line-height: 1;
}

.env-btn-label {
  white-space: nowrap;
}


</style>

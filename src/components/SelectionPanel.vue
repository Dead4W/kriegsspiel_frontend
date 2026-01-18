<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from 'vue'
import {useI18n} from 'vue-i18n'
import UnitDetailPanel from '@/components/UnitDetailPanel.vue'
import UnitActionPanel from "@/components/UnitActionPanel.vue";
import {UnitEnvironmentState, UnitEnvironmentStateIcon} from "@/engine/units/enums/UnitStates.ts";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import CommandsListPanel from "@/components/CommandsListPanel.vue";
import {Team} from "@/enums/teamKeys.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";

/* ================= i18n ================= */

const { t } = useI18n()

/* ================= props ================= */

defineProps<{ isEnd: boolean }>()

/* ================= state ================= */

const selectedUnits = ref<BaseUnit[]>([])
const focusedUnit = ref<BaseUnit | null>(null)

/* ================= world sync ================= */

function syncSelection(data: {reason: string}) {
  debugPerformance('SelectionPanel.syncSelection', () => {
    if (['camera', 'drag'].includes(data.reason)) return;

    const next = window.ROOM_WORLD.units.list().filter((u: BaseUnit) => u.selected)
    selectedUnits.value = next

    if (next.length === 1) {
      focusedUnit.value = next[0] as BaseUnit
      return
    }

    if (focusedUnit.value && !next.some(u => u.id === focusedUnit.value!.id)) {
      focusedUnit.value = null
    }
  })
}

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', syncSelection)
  syncSelection({ reason: "init" })
})

onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', syncSelection)
})

/* ================= computed ================= */

const hasSelection = computed(() => selectedUnits.value.length > 0)
const isMultiple = computed(() => selectedUnits.value.length > 1)

const selectionSummary = computed(() => {
  const map = new Map<string, { team: string; type: string; count: number }>()

  for (const u of selectedUnits.value) {
    const key = `${u.team}:${u.type}`
    map.set(key, {
      team: u.team,
      type: u.type,
      count: (map.get(key)?.count ?? 0) + 1,
    })
  }

  return [...map.values()]
})

/* ================= helpers ================= */

const unitTypeLabel = (u: BaseUnit) => t(`unit.${u.type}`)

const notifyEdit = () => {
  window.ROOM_WORLD.events.emit('changed', { reason: 'edit-unit' })
}

function envIcons(u: BaseUnit) {
  return u.envState
    .map((state) => ({
      state,
      icon: UnitEnvironmentStateIcon[state as UnitEnvironmentState],
    }))
    .filter(e => !!e.icon)
}

function isAdmin() {
  return window.PLAYER.team === Team.ADMIN
    || window.PLAYER.team === Team.SPECTATOR;
}

/* ================= focus ================= */

function toggleFocus(u: BaseUnit) {
  if (selectedUnits.value.length === 1) return
  focusedUnit.value = focusedUnit.value === u ? null : u
}

/* ================= ui ================= */

function barStyle(value: number, max: number) {
  const ratio = Math.max(0, Math.min(1, (value - 0) / (max - 0)))
  const percent = Math.round(ratio * 100)

  if (percent <= 5) {
    return { width: `${percent}%`, backgroundColor: '#ef4444' }
  }

  const r = Math.round(239 + (34 - 239) * ratio)
  const g = Math.round(68 + (197 - 68) * ratio)
  const b = Math.round(68 + (94 - 68) * ratio)

  return {
    width: `${percent}%`,
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
  }
}
</script>


<template>
  <div v-if="hasSelection" class="selection-root">

    <!-- ===== DETAIL & COMMANDS ===== -->
    <div v-if="focusedUnit" class="detail-anchor">
      <div class="detail-stack">
        <CommandsListPanel :unit="focusedUnit as BaseUnit" v-if="isAdmin()" />
        <UnitDetailPanel
          :unit="focusedUnit"
          @edit="notifyEdit"
        />
      </div>
    </div>

    <!-- ===== ACTIONS ===== -->
    <UnitActionPanel
      v-if="!isEnd"
      :units="selectedUnits"
      @edit="notifyEdit"
    />

    <!-- ===== SUMMARY ===== -->
    <div v-if="isMultiple" class="summary-bar">
      <div
        v-for="s in selectionSummary"
        :key="s.team! + s.type"
        class="summary-item"
      >
        <span class="team-dot" :class="s.team" />
        <span class="summary-type">{{ t(`unit.${s.type}`) }}</span>
        <span class="summary-count">×{{ s.count }}</span>
      </div>
    </div>

    <!-- ===== MINI LIST ===== -->
    <div v-if="isMultiple" class="mini-bar">
      <div
        v-for="u in selectedUnits"
        :key="u.id"
        class="mini-card"
        :class="{ active: u === focusedUnit }"
        @click="toggleFocus(u as BaseUnit)"
      >
        <div class="mini-type">
          <span class="team-dot" :class="u.team" />
          {{ unitTypeLabel(u as BaseUnit) }}

          <span class="env-icons">
            <span
              v-for="{icon, state} in envIcons(u as BaseUnit)"
              :key="icon"
              class="env-icon"
              :title="t(`env.${state}`)"
            >
              {{ icon }}
            </span>
          </span>
        </div>

        <div class="mini-label">
          {{ u.label }}
        </div>

        <div class="mini-hp">
          <div
            class="fill"
            :style="barStyle(
              u.hp,
              u.stats.maxHp
            )"
          />
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.selection-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  pointer-events: none;
}

/* ===== summary ===== */

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 12px;
  //background: #020617ee;
  //border-top: 1px solid #1e293b;
  font-size: 11px;
  color: #cbd5f5;
  pointer-events: none;
}

.summary-item {
  background: #020617ee;
  border-radius: 8px;
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.summary-type {
  color: #94a3b8;
}

.summary-count {
  font-weight: 600;
}

/* ===== mini ===== */

.mini-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 12px;
  //background: #020617ee;
  //border-top: 1px solid #334155;
  pointer-events: auto;
  max-height: 150px;
  overflow-y: auto;
}

.mini-card {
  width: 139px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mini-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}

.mini-type {
  font-size: 9px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
}

.mini-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-hp {
  height: 4px;
  background: #1e293b;
  border-radius: 4px;
  overflow: hidden;
  margin-top: auto;
}

.env-icons {
  display: inline-flex;
  gap: 2px;
  margin-left: 4px;
}

.env-icon {
  font-size: 10px;
  line-height: 1;
  opacity: 0.9;
}


/* ===== team dot ===== */

.team-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.team-dot.red { background: #ef4444 }
.team-dot.blue { background: #3b82f6 }
.team-dot.neutral { background: #94a3b8 }

/* ===== bars ===== */

.bar {
  flex: 1;
  height: 6px;
  background: #1e293b;
  border-radius: 4px;
  overflow: hidden;
}

.bar.ammo .fill {
  background: #3b82f6;
}

.fill {
  height: 100%;
  background: #22c55e;
}

.bottom-detail {
  position: fixed;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  z-index: 10;
  pointer-events: none;
}

.detail-anchor {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  margin-bottom: 6px;
  pointer-events: none;
  animation: slide-up 0.15s ease-out;
}

.detail-stack {
  display: flex;
  align-items: stretch;
  gap: 0;
  pointer-events: auto;
  max-height: 300px;
}

@keyframes slide-up {
  from {
    transform: translate(-50%, 10px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}


</style>

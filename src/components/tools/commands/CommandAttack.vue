<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { useI18n } from 'vue-i18n'
import type {OverlayItem, OverlayLine} from "@/engine/types/overlayTypes.ts";
import {AttackCommand} from "@/engine/units/commands/attackCommand.ts";
import {getTeamColor} from "@/engine/render/util.ts";
import {type unitTeam, unitType} from "@/engine";
import type { unsub } from "@/engine/events";

const {t} = useI18n()

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function teamColor(team: unitTeam) {
  const {r, g, b} = getTeamColor(team)
  return `rgba(${r},${g},${b}, 1)`
}

/* ================= SNAPSHOT ================= */

/** Атакующие фиксируются при открытии */
const attackers = ref<BaseUnit[]>([])

/** Цели — считаются по текущему выделению */
const targets = ref<BaseUnit[]>([])

/* ================= GROUPING ================= */

interface UnitGroup {
  type: unitType
  team: unitTeam
  count: number
}

function group(units: BaseUnit[]): UnitGroup[] {
  const map = new Map<string, UnitGroup>()

  for (const u of units) {
    const key = `${u.type}:${u.team}`
    map.set(key, {
      type: u.type,
      team: u.team,
      count: (map.get(key)?.count ?? 0) + 1,
    })
  }

  return [...map.values()]
}

const attackersGrouped = computed(() => group(attackers.value))
const targetsGrouped = computed(() => group(targets.value))

/* ================= DAMAGE ================= */

const damageModifier = ref(1.0)

/* ================= SELECTION SYNC ================= */

function syncTargets() {
  targets.value = window.ROOM_WORLD.units
    .list()
    .filter(u => u.selected && u.team !== attackers.value[0]?.team)
}

/* ================= ACTION ================= */

function confirm() {
  if (!targets.value.length) return

  const cmd = new AttackCommand({
    targets: targets.value.map(u => u.id),
    damageModifier: damageModifier.value,
  })

  for (const u of attackers.value) {
    u.addCommand(cmd.getState())
    u.setDirty()
  }

  attackers.value = [];
  targets.value = [];

  window.ROOM_WORLD.clearOverlay()
  emit('close')
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
}

// OVERLAY

function rebuildAttackOverlay() {
  if (!attackers.value.length || !targets.value.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  const items: OverlayItem[] = []

  for (const a of attackers.value) {
    for (const t of targets.value) {
      items.push({
        type: 'line',
        from: a.pos,
        to: t.pos,
        color: '#facc15',
        width: 1,
        dash: [6, 6],
        dashOffset: -1,
      } satisfies OverlayLine)
    }
  }

  window.ROOM_WORLD.setOverlay(items)
}

// LIFE CYCLE

let timer: number | null = null;
let unsubscribe: unsub;

onMounted(() => {
  attackers.value = [...props.units]
  syncTargets()

  rebuildAttackOverlay()

  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason !== 'select-end') return;
    syncTargets()
    rebuildAttackOverlay()
  })
  timer = setInterval(() => {
    window.ROOM_WORLD.events.emit('changed', { reason: 'animation' })
  }, 100);
})

onUnmounted(() => {
  attackers.value = [];
  targets.value = [];
  unsubscribe();

  window.ROOM_WORLD.events.off('changed', syncTargets)
  window.ROOM_WORLD.clearOverlay()
  if (timer) clearInterval(timer);
})

</script>

<template>
  <div class="order-attack">

    <!-- ===== ATTACKERS ===== -->
    <div class="column">
      <div class="title">Атакуют</div>
      <div class="cards">
        <div
          v-for="a in attackersGrouped"
          :key="a.type + a.team"
          class="card"
          :style="{ color: teamColor(a.team) }"
        >
          {{ t(`unit.${a.type}`) }} × {{ a.count }}
        </div>
      </div>
    </div>

    <!-- ===== ARROW ===== -->
    <div class="arrow">➜</div>

    <!-- ===== TARGETS ===== -->
    <div class="column">
      <div class="title">Цели</div>
      <div class="cards">
        <div
          v-if="!targetsGrouped.length"
          class="hint"
        >
          Выделите противников
        </div>

        <div
          v-for="targetGroup in targetsGrouped"
          :key="targetGroup.type + targetGroup.team"
          class="card"
          :style="{ color: teamColor(targetGroup.team) }"
        >
          {{ t(`unit.${targetGroup.type}`) }} × {{ targetGroup.count }}
        </div>
      </div>
    </div>

    <!-- ===== SETTINGS ===== -->
    <div class="column settings">
      <div class="title">
        Урон × {{ damageModifier.toFixed(1) }}
      </div>
      <input
        type="range"
        min="0"
        max="3"
        step="0.1"
        v-model.number="damageModifier"
      />
    </div>

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button class="btn cancel" @click="emit('close')">
        Отмена
      </button>

      <button
        class="btn confirm"
        :disabled="!targets.length"
        @click="confirm"
      >
        Атаковать
      </button>
    </div>

  </div>
</template>

<style scoped>
.order-attack {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 12px;
  background: #020617ee;
  border-top: 1px solid #334155;
  font-size: 11px;
}

/* ===== columns ===== */

.column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.column.settings {
  min-width: 140px;
}

.column.actions {
  justify-content: flex-end;
}

/* ===== text ===== */

.title {
  color: #94a3b8;
  font-size: 10px;
}

.hint {
  font-size: 10px;
  color: #64748b;
}

/* ===== cards ===== */

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card {
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  white-space: nowrap;
}

.card.attacker {
  color: #f87171;
}

.card.target {
  color: #60a5fa;
}

/* ===== arrow ===== */

.arrow {
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 14px;
}

/* ===== buttons ===== */

.btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  cursor: pointer;
}

.btn.confirm {
  color: #22c55e;
}

.btn.cancel {
  color: #94a3b8;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

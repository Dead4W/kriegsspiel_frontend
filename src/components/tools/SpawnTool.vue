<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { world } from '@/engine'
import type { unitstate, unitTeam } from '@/engine'
import { unitType as UnitType } from '@/engine'
import { useI18n } from 'vue-i18n'
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {Team} from "@/enums/teamKeys.ts";

const { t } = useI18n()

/* ================= props ================= */

const props = defineProps<{
  world: world
}>()

/* ================= state ================= */

const selectedType = ref<UnitType>(UnitType.INFANTRY)
const selectedTeam = ref<unitTeam>('red')
if ([Team.RED, Team.BLUE].includes(window.PLAYER.team)) {
  selectedTeam.value = window.PLAYER.team as unitTeam
}
const spawnCount = ref(1)

/* ================= computed i18n data ================= */

const UNIT_TYPES = computed(() => [
  { type: UnitType.INFANTRY, label: t('unit.infantry') },
  { type: UnitType.CAVALRY, label: t('unit.cavalry') },
  { type: UnitType.ARTILLERY, label: t('unit.artillery') },
  { type: UnitType.MARINE, label: t('unit.marine') },
  { type: UnitType.MILITIA, label: t('unit.militia') },
  { type: UnitType.GATLING, label: t('unit.gatling') },
  { type: UnitType.GENERAL, label: t('unit.general') },
])
const TEAMS = computed(() => {
  if (window.PLAYER.team === Team.ADMIN) {
    return [
      { value: 'red' as unitTeam, label: t('team.red') },
      { value: 'blue' as unitTeam, label: t('team.blue') },
      { value: 'neutral' as unitTeam, label: t('team.white') },
    ]
  } else {
    return [
      { value: 'red' as unitTeam, label: t('team.red') },
      { value: 'blue' as unitTeam, label: t('team.blue') },
    ]
  }
})

/* ================= helpers ================= */

function isOccupied(w: world, pos: { x: number; y: number }, radius = 20) {
  return w.units.list().some(u => {
    if (!u.alive) return false
    const dx = u.pos.x - pos.x
    const dy = u.pos.y - pos.y
    return dx * dx + dy * dy < radius * radius
  })
}

function findFreePositions(
  w: world,
  origin: { x: number; y: number },
  count: number
) {
  const result: { x: number; y: number }[] = []

  const MAX_PER_ROW = 5
  const STEP_X = BaseUnit.COLLISION_RANGE
  const STEP_Y = BaseUnit.COLLISION_RANGE

  let row = 0
  let col = 0

  while (result.length < count && row < 100) {
    const x =
      origin.x + col * STEP_X
    const y = origin.y + row * STEP_Y

    const pos = { x, y }

    if (!isOccupied(w, pos)) {
      result.push(pos)
      col++
    } else {
      // если занято — всё равно двигаемся вправо,
      // чтобы не застрять в одной точке
      col++
    }

    if (col >= MAX_PER_ROW) {
      col = 0
      row++
    }
  }

  return result
}

function getNextUnitName(
  w: world,
  type: UnitType,
  team: unitTeam
): string {
  const base = t(`unit.${type}`)
  let used = [];

  for (const u of w.units.list()) {
    if (u.team !== team) continue
    if (!u.label?.startsWith(base + ' ')) continue

    const n = Number(u.label.slice(base.length + 1))
    if (!Number.isNaN(n)) {
      used.push(n);
    }
  }

  let i = 1
  while (used.includes(i)) i++
  return t(`unit.${type}`) + ` ${i}`
}

/* ================= spawn ================= */

function onClick(e: PointerEvent) {
  if (e.button !== 0) return;

  if ((e.target as HTMLElement)?.closest('.spawn-panel')) return

  const w = props.world
  if (!w) return

  const origin = w.camera.screenToWorld({
    x: e.clientX,
    y: e.clientY,
  })

  const positions = findFreePositions(
    w,
    origin,
    spawnCount.value
  )

  for (const pos of positions) {
    const unit = {
      id: crypto.randomUUID(),
      type: selectedType.value,
      team: selectedTeam.value,
      pos,
      label: getNextUnitName(
        w,
        selectedType.value,
        selectedTeam.value
      ),
    }
    w.addUnits([unit])
  }
}

/* ================= hotkeys ================= */

function onKeyDown(e: KeyboardEvent) {
  // не мешаем вводу текста
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

  // 1–9 → выбор типа юнита
  if (e.key >= '1' && e.key <= '9') {
    const index = Number(e.key) - 1
    const types = UNIT_TYPES.value
    if (types[index]) {
      selectedType.value = types[index].type
    }
    return
  }

  // N → смена команды
  if (e.code === 'KeyN') {
    selectedTeam.value =
      selectedTeam.value === 'red' ? 'blue' : 'red'
  }
}

/* ================= lifecycle ================= */

onMounted(() => {
  window.addEventListener('pointerdown', onClick)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onClick)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="spawn-panel">
    <h3>{{ t('spawn.title') }}</h3>

    <!-- команда -->
    <div class="block">
      <label>{{ t('spawn.team') }}</label>
      <select v-model="selectedTeam">
        <option
          v-for="t in TEAMS"
          :key="t.value"
          :value="t.value"
        >
          {{ t.label }}
        </option>
      </select>
    </div>

    <!-- количество -->
    <div class="block">
      <label>{{ t('spawn.count') }}</label>
      <input
        type="number"
        v-model.number="spawnCount"
        min="1"
        max="50"
      />
    </div>

    <!-- тип юнита -->
    <div class="block">
      <label>{{ t('spawn.unit_type') }}</label>
      <div class="types">
        <button
          v-for="u in UNIT_TYPES"
          :key="u.type"
          :class="{ active: selectedType === u.type }"
          @click="selectedType = u.type"
        >
          {{ u.label }}
        </button>
      </div>
    </div>

    <div class="hint">
      {{ t('spawn.hint') }}
    </div>
  </div>
</template>

<style scoped>
.spawn-panel {
  position: absolute;
  top: 64px;
  left: 16px;

  width: 220px;
  padding: 12px;

  background: #020617ee;
  border: 1px solid #334155;
  border-radius: 10px;

  color: white;
  pointer-events: auto;
}

h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.block {
  margin-bottom: 10px;
}

label {
  display: block;
  font-size: 12px;
  margin-bottom: 4px;
  color: #94a3b8;
}

select {
  width: 100%;
  background: #020617;
  color: white;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px;
}

.types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.types button {
  flex: 1 1 48%;
  padding: 4px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: transparent;
  color: white;
  cursor: pointer;
}

.types button.active {
  background: var(--accent);
}

.hint {
  margin-top: 8px;
  font-size: 11px;
  color: #94a3b8;
}

input {
  width: 100%;
  background: #020617;
  color: white;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px;
}
</style>

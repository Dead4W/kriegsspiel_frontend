<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch, type UnwrapRef} from 'vue'
import {type unitTeam, world} from '@/engine'
import { unitType as UnitType } from '@/engine'
import { useI18n } from 'vue-i18n'
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {Team} from "@/enums/teamKeys.ts";
import { getSpawnUnitTypes } from "@/engine/resourcePack/units.ts";
import HotkeyTag from '@/components/ui/HotkeyTag.vue'
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import type {unitstate} from "@/engine/units/types.ts";

const { t } = useI18n()

/* ================= state ================= */

const selectedType = ref<UnitType>(UnitType.GENERAL)
const selectedTeam = ref<unitTeam>('red')
if ([Team.RED, Team.BLUE].includes(window.PLAYER.team)) {
  selectedTeam.value = window.PLAYER.team as unitTeam
}
const spawnCount = ref(1)
const debugUnitStateJson = ref('')
const debugCreateError = ref('')
const debugCreateSuccess = ref(false)

/* ================= computed i18n data ================= */

const SPAWNABLE_TYPES = computed(() => getSpawnUnitTypes())

watch(
  SPAWNABLE_TYPES,
  (types) => {
    if (!types.length) return
    if (!types.includes(selectedType.value)) {
      selectedType.value = types[0]!
    }
  },
  { immediate: true }
)

const UNIT_TYPES = computed(() =>
  SPAWNABLE_TYPES.value.map((type) => ({
    type,
    label: t(`unit.${type}`),
  }))
)
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

function isDebugMode() {
  return !!window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.DEBUG_MODE]
}

function parseDebugUnitState(raw: string): unitstate {
  const parsed = JSON.parse(raw) as Partial<unitstate>
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid-json')
  }
  if (!parsed.type || typeof parsed.type !== 'string') {
    throw new Error('missing-type')
  }
  if (!parsed.team || !['red', 'blue', 'neutral'].includes(parsed.team)) {
    throw new Error('missing-team')
  }
  if (!parsed.pos || typeof parsed.pos.x !== 'number' || typeof parsed.pos.y !== 'number') {
    throw new Error('missing-pos')
  }

  return {
    ...parsed,
    id: typeof parsed.id === 'string' && parsed.id.length > 0
      ? parsed.id
      : crypto.randomUUID(),
    type: parsed.type,
    team: parsed.team,
    pos: { x: parsed.pos.x, y: parsed.pos.y },
  }
}

function createUnitFromDebugJson() {
  debugCreateError.value = ''
  debugCreateSuccess.value = false
  const raw = debugUnitStateJson.value.trim()
  if (!raw) {
    debugCreateError.value = t('spawn.debug_create_error_empty')
    return
  }

  try {
    const parsed = parseDebugUnitState(raw)
    const w = window.ROOM_WORLD
    if (!w) return
    const state: unitstate = {
      ...parsed,
      id: parsed.id ?? crypto.randomUUID(),
      roomMapUserId: parsed.roomMapUserId ?? window.ROOM_WORLD.roomMapUserId ?? window.PLAYER.id,
    }
    w.addUnits([state])
    debugCreateSuccess.value = true
  } catch {
    debugCreateError.value = t('spawn.debug_create_error_parse')
  }
}

/* ================= spawn ================= */

function onClick(e: PointerEvent) {
  if (e.button !== 0) return;

  if ((e.target as HTMLElement)?.closest('.spawn-panel')) return

  const w = window.ROOM_WORLD
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
      roomMapUserId: window.ROOM_WORLD.roomMapUserId ?? window.PLAYER.id,
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
  window.INPUT.IGNORE_UNIT_INTERACTION = true
  window.addEventListener('pointerdown', onClick)
  window.addEventListener('keydown', onKeyDown)
  if (UNIT_TYPES.value.length > 0) {
    selectedType.value = UNIT_TYPES.value[0]!.type;
  }
})

onBeforeUnmount(() => {
  window.INPUT.IGNORE_UNIT_INTERACTION = false
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
      <div class="select-wrap">
        <select v-model="selectedTeam">
          <option
            v-for="t in TEAMS"
            :key="t.value"
            :value="t.value"
          >
            {{ t.label }}
          </option>
        </select>
        <HotkeyTag key-label="N" />
      </div>
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
          v-for="(u, idx) in UNIT_TYPES"
          :key="u.type"
          :class="{ active: selectedType === u.type }"
          @click="selectedType = u.type"
        >
          {{ u.label }}
          <HotkeyTag v-if="idx < 9" :key-label="String(idx + 1)" />
        </button>
      </div>
    </div>

    <div class="hint">
      {{ t('spawn.hint') }}
    </div>

    <div v-if="isDebugMode()" class="debug-section">
      <label>{{ t('spawn.debug_create_title') }}</label>
      <textarea
        v-model="debugUnitStateJson"
        class="debug-textarea"
        :placeholder="t('spawn.debug_create_placeholder')"
      />
      <button type="button" class="debug-create-btn" @click="createUnitFromDebugJson">
        {{ t('spawn.debug_create_button') }}
      </button>
      <div v-if="debugCreateError" class="debug-msg err">{{ debugCreateError }}</div>
      <div v-else-if="debugCreateSuccess" class="debug-msg ok">{{ t('spawn.debug_create_success') }}</div>
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

.select-wrap {
  position: relative;
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
  position: relative;
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

.debug-section {
  margin-top: 10px;
  border-top: 1px solid #334155;
  padding-top: 10px;
}

.debug-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  background: #020617;
  color: white;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.debug-create-btn {
  margin-top: 6px;
  width: 100%;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #020617;
  color: #cbd5f5;
  padding: 6px;
  cursor: pointer;
  font-size: 12px;
}

.debug-create-btn:hover {
  color: white;
  border-color: var(--accent);
}

.debug-msg {
  margin-top: 6px;
  font-size: 11px;
}

.debug-msg.ok {
  color: #86efac;
}

.debug-msg.err {
  color: #fca5a5;
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

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from 'vue'
import {BaseUnit} from '@/engine/units/baseUnit'
import type {OverlayItem} from '@/engine/types/overlayTypes'
import type {vec2} from '@/engine/types'
import {MoveCommand} from '@/engine/units/commands/moveCommand'
import {useI18n} from 'vue-i18n'
import {getTeamColor} from '@/engine/render/util'
import {type unitTeam, unitType, type uuid} from '@/engine'
import type {unsub} from '@/engine/events'
import {unitlayer} from "@/engine/render/unitlayer.ts";
import {normalize, sub} from "@/engine/math.ts";
import {UnitEnvironmentState, UnitEnvironmentStateIcon} from "@/engine/units/enums/UnitStates.ts";

const { t } = useI18n()

function teamColor(team: unitTeam) {
  const { r, g, b } = getTeamColor(team)
  return `rgba(${r},${g},${b}, 1)`
}

/* ================= Helpers ======================== */

function envIcon(state: UnitEnvironmentState) {
  return UnitEnvironmentStateIcon[state]
}

function toggleRouteModifier(mod: UnitEnvironmentState) {
  if (!targets.value.length) return

  const activeTarget = targets.value[targets.value.length - 1]!;

  activeTarget.modifier = activeTarget.modifier !== mod
    ? mod
    : null;
}

function pointOnSegmentFromEnd(
  start: vec2,
  end: vec2,
  distFromEnd: number
): vec2 {
  const dx = start.x - end.x
  const dy = start.y - end.y
  const len = Math.hypot(dx, dy)

  const t = distFromEnd / len

  return {
    x: end.x + dx * t,
    y: end.y + dy * t,
  }
}

/* ================= Math ========================== */
/** Направление для сегмента, который заканчивается в targets[segIndex] */
function getColumnDir(segIndex: number): vec2 {
  const last = targets.value[segIndex]!
  const prev = segIndex > 0 ? targets.value[segIndex - 1] : null

  if (prev) return normalize(sub(last.pos, prev.pos))

  // если нет предыдущей точки — строим направление от центра группы (или от среднего)
  const center = formationCenter.value
  if (center) return normalize(sub(last.pos, center))

  // fallback
  return normalize(sub(last.pos, movingUnits.value[0]?.pos ?? { x: last.pos.x - 1, y: last.pos.y }))
}

/* ================= props / emits ================= */

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/* ================= SNAPSHOT ================= */

const ROUTE_MODIFIERS = [
  UnitEnvironmentState.OnRoad,
  UnitEnvironmentState.InForest,
  UnitEnvironmentState.OnGoodRoad,
  UnitEnvironmentState.InWater,
]

export type RoutePoint = {
  pos: vec2
  modifier?: UnitEnvironmentState | null
}

const movingUnits = ref<BaseUnit[]>([])
const targets = ref<RoutePoint[]>([])

/* ================= MOVE MODE ================= */

type MoveMode = 'column' | 'formation'
const moveMode = ref<MoveMode>('column')

/* ================= FORMATION ================= */

type MovePlanItem = { unit: BaseUnit; orderIndex: number }

/** План (порядок) колонны считается по первой точке маршрута */
const movePlan = computed<MovePlanItem[]>(() => {
  if (!movingUnits.value.length || !targets.value.length) return []

  const firstTarget = targets.value[0]!
  const unitsLeft = [...movingUnits.value]
  const result: typeof movingUnits.value = []

  // 1. Находим ближайшего к первой точке маршрута
  let current = unitsLeft.reduce((closest, unit) => {
    const d1 = Math.hypot(
      unit.pos.x - firstTarget.pos.x,
      unit.pos.y - firstTarget.pos.y
    )
    const d2 = Math.hypot(
      closest.pos.x - firstTarget.pos.x,
      closest.pos.y - firstTarget.pos.y
    )
    return d1 < d2 ? unit : closest
  })

  result.push(current)
  unitsLeft.splice(unitsLeft.indexOf(current), 1)

  // 2. Остальных выстраиваем по близости к предыдущему
  while (unitsLeft.length) {
    const last = current

    current = unitsLeft.reduce((closest, unit) => {
      const d1 = Math.hypot(
        unit.pos.x - last.pos.x,
        unit.pos.y - last.pos.y
      )
      const d2 = Math.hypot(
        closest.pos.x - last.pos.x,
        closest.pos.y - last.pos.y
      )
      return d1 < d2 ? unit : closest
    })

    result.push(current)
    unitsLeft.splice(unitsLeft.indexOf(current), 1)
  }

  return result.map((unit, orderIndex) => ({ unit, orderIndex }))
})

const formationCenter = computed<vec2 | null>(() => {
  if (!movingUnits.value.length) return null

  const sum = movingUnits.value.reduce(
    (a, u) => {
      a.x += u.pos.x
      a.y += u.pos.y
      return a
    },
    { x: 0, y: 0 }
  )

  return {
    x: sum.x / movingUnits.value.length,
    y: sum.y / movingUnits.value.length,
  }
})

const formationOffsets = computed<Record<uuid, vec2>>(() => {
  if (!formationCenter.value) return {}

  return Object.fromEntries(
    movingUnits.value.map(u => [
      u.id,
      {
        x: u.pos.x - formationCenter.value!.x,
        y: u.pos.y - formationCenter.value!.y,
      },
    ])
  )
})

function getColumnPosition(
  segIndex: number,
  orderIndex: number,
  targets: RoutePoint[],
  plan: MovePlanItem[],
): vec2[] {
  // лидер всегда на точке маршрута
  if (orderIndex === 0) {
    return [targets[segIndex]!.pos]
  }

  let remaining = orderIndex * BaseUnit.COLLISION_RANGE
  let leftSegmentDistance = 0;
  let currentSegmentIndex = 0;

  const result = [];
  // Считаем последнюю позицию
  for (let j = targets.length-1; j >= -orderIndex; j--) {
    // 0-N - segments
    // -1,-2,-3 - prev units include current unit
    const prev = j > 0 ? targets[j-1]!.pos : plan[Math.abs(j)]!.unit.pos;
    const next = j >= 0 ? targets[j]!.pos : plan[Math.abs(j+1)]!.unit.pos;
    const segment = sub(prev, next)
    const segLen = Math.hypot(segment.x, segment.y)

    if (segLen > remaining) {
      leftSegmentDistance = segLen - remaining;
      currentSegmentIndex = j;
      if (segIndex === targets.length-1) {
        const point = pointOnSegmentFromEnd(
          prev,
          next,
          remaining
        )
        result.push(point)
      }
      remaining = 0;

      break
    }

    remaining -= segLen
  }

  // Нет места
  if (remaining > 0) {
    return [];
  }

  for (let i = targets.length-1; i >= segIndex; i--) {
    const iterationSegPrev = i > 0 ? targets[i-1]!.pos : plan[Math.abs(i)]!.unit.pos;
    const iterationSegNext = targets[i]!.pos;
    const iterationSegment = sub(iterationSegPrev, iterationSegNext);
    let iterationLen = Math.hypot(iterationSegment.x, iterationSegment.y)

    // Считаем точки для пройденного сегмента
    for (let j = currentSegmentIndex; j >= -orderIndex+1; j--) {
      // 0-N - segments
      // -1,-2,-3 - prev units include current unit
      const prev = j > 0 ? targets[j-1]!.pos : plan[Math.abs(j)]!.unit.pos;
      const next = j >= 0 ? targets[j]!.pos : plan[Math.abs(j+1)]!.unit.pos;
      const segment = sub(prev, next);

      if (leftSegmentDistance === 0) {
        leftSegmentDistance = Math.hypot(segment.x, segment.y)
      }

      if(segIndex === 0 && currentSegmentIndex === 0) {
        //Вставляем промежуточную точку
        result.push({x: prev.x, y: prev.y})
        continue;
      }

      if (leftSegmentDistance > iterationLen) {
        leftSegmentDistance -= iterationLen;
        currentSegmentIndex = j;
        if (segIndex === i) {
          const point = pointOnSegmentFromEnd(
            prev,
            next,
            leftSegmentDistance
          )

          result.push(point)
          result.reverse()
          return result;
        }
        iterationLen = 0;
        break
      }
      iterationLen -= leftSegmentDistance;
      leftSegmentDistance = 0

      if (segIndex === i && j > 0) {
        //Вставляем промежуточную точку
        result.push({x: prev.x, y: prev.y})
      }
    }

    // Нет места
    if (iterationLen > 0) {
      result.reverse();
      return result;
    }
  }

  result.reverse();
  return result;
}



function getSegmentForUnit(
  leaderSeg: number,
  offset: number,
  targets: RoutePoint[]
): { seg: number; offset: number } {
  let remaining = offset
  let seg = leaderSeg

  while (seg > 0) {
    const a = targets[seg]!.pos
    const b = targets[seg - 1]!.pos
    const len = Math.hypot(a.x - b.x, a.y - b.y)

    if (remaining <= len) {
      return { seg, offset: remaining }
    }

    remaining -= len
    seg--
  }

  return { seg: 0, offset: 0 }
}


/* ================= GROUPING ================= */

function group(units: UnwrapRef<BaseUnit[]>) {
  const map = new Map<string, { type: string; team: unitTeam; count: number }>()

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

const unitsGrouped = computed(() => group(movingUnits.value))

/* ================= TARGET PICK ================= */

function onPointerDown(e: PointerEvent) {
  if (e.button !== 2) return
  if ((e.target as HTMLElement)?.closest('.order-move')) return

  // ⛔ остановить событие для других onPointerDown
  e.stopPropagation()
  e.preventDefault()

  const world = window.ROOM_WORLD
  const pos = world.camera.screenToWorld({
    x: e.clientX,
    y: e.clientY,
  })

  let modifier = null;
  if (targets.value.length) {
    modifier = targets.value[targets.value.length - 1]!.modifier ?? null;
  }

  if (e.shiftKey) {
    // Shift + ПКМ — добавить точку
    targets.value.push({pos, modifier: modifier})
  } else {
    // ПКМ — редактировать последнюю
    if (!targets.value.length) {
      targets.value.push({pos, modifier: modifier})
    } else {
      targets.value[targets.value.length - 1] = {pos, modifier: targets.value[targets.value.length - 1]!.modifier ?? null}
    }
  }



  rebuildMoveOverlay()
}


/* ================= OVERLAY ================= */

function rebuildMoveOverlay() {
  if (!movingUnits.value.length || !targets.value.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  const items: OverlayItem[] = []

  // используем план, чтобы порядок был стабильный
  const plan = movePlan.value

  plan.forEach(({ unit: u, orderIndex }, planIdx) => {
    let from = u.pos

    for (let segIndex = 0; segIndex < targets.value.length; segIndex++) {
      const t = targets.value[segIndex]!

      let to_points: vec2[] = [];

      if (moveMode.value === 'formation' && formationOffsets.value[u.id]) {
        to_points = [{
          x: t.pos.x + formationOffsets.value[u.id]!.x,
          y: t.pos.y + formationOffsets.value[u.id]!.y,
        }]
      } else if (moveMode.value === 'column') {
        to_points = getColumnPosition(segIndex, orderIndex, targets.value, plan)
      } else {
        to_points = [t.pos]
      }

      for (const to of to_points) {
          items.push({
            type: 'line',
            from,
            to,
            color: moveMode.value === 'column' ? '#22c55e' : '#38bdf8',
            width: 6,
            dash: [6, 6],
            dashOffset: -1,
          })
        from = to;
      }

      if (segIndex === targets.value.length-1) {
        const to = to_points.length ? to_points[to_points.length-1]! : u.pos;
        const { r, g, b } = getTeamColor(u.team)
        if (u.type === unitType.MESSENGER) {
          items.push({
            type: 'circle',
            center: {x: to.x, y: to.y},
            radius: Math.min(unitlayer.BASE_UNIT_W, unitlayer.BASE_UNIT_H) / 1.5,
            color: `rgba(${r},${g},${b},0.25)`,
            strokeColor: 'black',
          })
        } else {
          items.push({
            type: 'rect',
            from: { x: to.x - unitlayer.BASE_UNIT_W / 2, y: to.y - unitlayer.BASE_UNIT_H / 2 },
            to: { x: to.x + unitlayer.BASE_UNIT_W / 2, y: to.y + unitlayer.BASE_UNIT_H / 2 },
            fillColor: `rgba(${r},${g},${b},0.25)`,
            color: 'black',
          })
        }
      }

      if (to_points.length) from = to_points[to_points.length-1]!
    }
  })

  window.ROOM_WORLD.setOverlay(items)
}

/* ================= ACTION ================= */

function confirm() {
  if (!movingUnits.value.length || !targets.value.length) {
    return
  }

  const uniqueId = crypto.randomUUID();

  // используем план, чтобы порядок был стабильный
  const plan = movePlan.value
  plan.forEach(({ unit: u, orderIndex }, planIdx) => {
    for (let segIndex = 0; segIndex < targets.value.length; segIndex++) {
      const t = targets.value[segIndex]!

      let to_points: vec2[] = [];

      if (moveMode.value === 'formation' && formationOffsets.value[u.id]) {
        to_points = [{
          x: t.pos.x + formationOffsets.value[u.id]!.x,
          y: t.pos.y + formationOffsets.value[u.id]!.y,
        }]
      } else if (moveMode.value === 'column') {
        to_points = getColumnPosition(segIndex, orderIndex, targets.value, plan)
        if (orderIndex > 0) {
        }
      } else {
        to_points = [t.pos]
      }

      for (const to of to_points) {
        const cmd = new MoveCommand({
          target: to,
          modifier: t.modifier ?? null,
          orderIndex: orderIndex,
          uniqueId: uniqueId,
        })
        u.addCommand(cmd.getState())
      }
    }

    u.setDirty()
  })

  cleanup()
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
}


function cleanup() {
  movingUnits.value = []
  targets.value = []
  window.ROOM_WORLD.clearOverlay()
  emit('close')
}

/* ================= LIFE CYCLE ================= */

let timer: number | null = null
let unsubscribe: unsub

onMounted(() => {
  movingUnits.value = [...props.units]

  window.addEventListener('pointerdown', onPointerDown)

  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason === 'overlay' || reason === 'animation') return
    rebuildMoveOverlay()
  })

  timer = setInterval(() => {
    window.ROOM_WORLD.events.emit('changed', { reason: 'animation' })
  }, 100)
  window.INPUT.IGNORE_DRAG = true;
})

onUnmounted(() => {
  unsubscribe?.()
  movingUnits.value = []
  targets.value = []
  window.removeEventListener('pointerdown', onPointerDown)
  window.ROOM_WORLD.clearOverlay()
  if (timer) clearInterval(timer)
  window.INPUT.IGNORE_DRAG = false;
})
</script>

<template>
  <div class="order-move">
    <!-- ===== UNITS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.units') }}</div>
      <div class="cards">
        <div
          v-for="u in unitsGrouped"
          :key="u.type + u.team"
          class="card unit"
          :style="{ color: teamColor(u.team) }"
        >
          {{ t(`unit.${u.type}`) }} × {{ u.count }}
        </div>
      </div>
    </div>

    <div class="arrow">➜</div>

    <!-- ===== TARGETS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.route') }}</div>

      <div v-if="!targets.length" class="hint">
        {{ t('tools.command.pickRouteHint') }}
      </div>

      <div
        v-else-if="movingUnits.length > 0"
        class="target-pos"
      >
        <div v-for="(t, i) in targets" :key="i">
          {{ i + 1 }}: x {{ t.pos.x.toFixed(0) }}, y {{ t.pos.y.toFixed(0) }}
          <span v-if="t.modifier">{{ envIcon(t.modifier) }}</span>
        </div>
      </div>
    </div>

    <!-- ===== MOVE MODE ===== -->
    <div class="column" v-if="movingUnits.length > 1">
      <div class="title">{{ t('tools.command.moveMode') }}</div>

      <label class="radio">
        <input type="radio" value="column" v-model="moveMode" />
        <span class="radio-ui formation"></span>
        {{ t('tools.command.moveModeColumn') }}
      </label>

      <label class="radio">
        <input type="radio" value="formation" v-model="moveMode" />
        <span class="radio-ui formation"></span>
        {{ t('tools.command.moveModeFormation') }}
      </label>
    </div>

    <!-- ===== ENV MODIFIER ===== -->
    <div v-if="targets.length" class="env-panel">
      <div class="env-title">
        🧭 {{ t('tools.command.routeModifiers') }}
      </div>

      <!-- === 2 строки === -->
      <div class="env-buttons two-lines">
        <button
          v-for="mod in ROUTE_MODIFIERS"
          :key="mod"
          class="env-btn"
          :class="{ active: targets[targets.length-1]!.modifier === mod }"
          @click="toggleRouteModifier(mod)"
        >
        <span class="env-btn-icon">{{ envIcon(mod) }}</span>
        <span class="env-btn-label">
          {{ t(`env.${mod}`) }}
        </span>
        </button>
      </div>
    </div>

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button class="btn cancel" @click="emit('close')">
        {{ t('tools.command.cancel') }}
      </button>

      <button
        class="btn confirm"
        :disabled="!targets.length"
        @click="confirm"
      >
        {{ t('tools.command.move') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.order-move {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 12px;
  background: #020617ee;
  border-top: 1px solid #334155;
  font-size: 11px;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.column.actions {
  justify-content: flex-end;
}

.title {
  color: #94a3b8;
  font-size: 10px;
}

.hint {
  font-size: 10px;
  color: #64748b;
  white-space: pre-line;
}

.target-pos {
  font-size: 10px;
  color: #38bdf8;
}

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

.arrow {
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 14px;
}

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

.radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #cbd5f5;
}

.radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #cbd5f5;
  cursor: pointer;
  user-select: none;
  align-self: flex-start;
}

.radio input {
  display: none;
}

/* круг */
.radio-ui {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #475569;
  background: #020617;
  position: relative;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

/* точка внутри */
.radio-ui::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: transparent;
  transform: scale(0.4);
  opacity: 0;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

/* ===== FORMATION ===== */
.radio input:checked + .radio-ui.formation {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px #22c55e33;
}

.radio input:checked + .radio-ui.formation::after {
  background: #22c55e;
  transform: scale(1);
  opacity: 1;
}

/* hover */
.radio:hover .radio-ui {
  border-color: #94a3b8;
}

.env-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 12px;
  background: #020617ee;
  border-top: 1px solid #1e293b;
  pointer-events: auto;
}

.env-title {
  font-size: 10px;
  color: #94a3b8;
}

/* === 2 строки === */
.env-buttons.two-lines {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  gap: 4px 6px;
}

.env-btn {
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #cbd5f5;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.env-btn.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
  color: #e5e7eb;
}

.env-btn.danger {
  color: #f87171;
}

.env-btn-icon {
  font-size: 11px;
  line-height: 1;
}

.env-btn-label {
  white-space: nowrap;
}
</style>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from 'vue'
import {BaseUnit} from '@/engine/units/baseUnit'
import type {OverlayItem} from '@/engine/types/overlayTypes'
import type {vec2} from '@/engine/types'
import {MoveCommand} from '@/engine/units/commands/moveCommand'
import {useI18n} from 'vue-i18n'
import {getTeamColor} from '@/engine/render/util'
import {type commandstate, type unitTeam, unitType, type uuid} from '@/engine'
import type {unsub} from '@/engine/events'
import {unitlayer} from "@/engine/render/unitlayer.ts";
import {normalize, sub} from "@/engine/math.ts";
import {UnitEnvironmentState, UnitEnvironmentStateIcon} from "@/engine/units/enums/UnitStates.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import type {BaseCommand} from "@/engine/units/commands/baseCommand.ts";
import {WaitCommand} from "@/engine/units/commands/waitCommand.ts";
import RadialMenu, { type RadialMenuItem } from '@/components/ui/RadialMenu.vue'

const { t } = useI18n()

function teamColor(team: unitTeam) {
  const { r, g, b } = getTeamColor(team)
  return `rgba(${r},${g},${b}, 1)`
}

/* ================= Helpers ======================== */

function envIcon(state: UnitEnvironmentState) {
  return UnitEnvironmentStateIcon[state]
}

function setRouteModifier(mod: UnitEnvironmentState | null) {
  if (!targets.value.length) return
  targets.value[targets.value.length - 1]!.modifier = mod
  rebuildMoveOverlay()
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
  UnitEnvironmentState.OnGoodRoad,
  UnitEnvironmentState.InForest,
  UnitEnvironmentState.InField,
  UnitEnvironmentState.InPlainField,
  UnitEnvironmentState.InSoftField,
  UnitEnvironmentState.InSwampOrDirty,
]

export type RoutePoint = {
  pos: vec2
  modifier?: UnitEnvironmentState | null
}

const movingUnits = ref<BaseUnit[]>([])
const targets = ref<RoutePoint[]>([])

/* ================= DISTANCE (meters) ================= */

function distPx(a: vec2, b: vec2) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

const routeStartPos = computed<vec2 | null>(() => {
  const u = movingUnits.value[0]
  if (!u) return null
  return u.futurePos ?? u.pos
})

const routeDistancesMeters = computed<number[]>(() => {
  const start = routeStartPos.value
  if (!start || !targets.value.length) return []

  const mpp = window.ROOM_WORLD?.map?.metersPerPixel ?? 1

  let prev = start
  return targets.value.map((t) => {
    const total = distPx(prev, t.pos) * mpp
    prev = t.pos
    return total
  })
})

function fmtMeters(meters: number) {
  return `${Math.round(meters)} m`
}

/* ================= ENV MENU (radial) ================= */

type EnvMenuId = UnitEnvironmentState | 'none'

const envMenuOpen = ref(false)
const envMenuCenter = ref<vec2>({ x: 0, y: 0 })
const envMenuAnchorWorld = ref<vec2 | null>(null)
const envMenuAutoConfirm = ref(false)

let envMenuRaf: number | null = null
let lastCamKey = ''

function updateEnvMenuCenter() {
  const anchor = envMenuAnchorWorld.value
  if (!anchor) return

  const cam = window.ROOM_WORLD.camera
  const key = `${cam.pos.x.toFixed(2)}:${cam.pos.y.toFixed(2)}:${cam.zoom.toFixed(4)}:${anchor.x.toFixed(2)}:${anchor.y.toFixed(2)}`
  if (key === lastCamKey) return
  lastCamKey = key

  envMenuCenter.value = cam.worldToScreen(anchor)
}

function startEnvMenuTracking() {
  if (envMenuRaf != null) return
  const loop = () => {
    if (!envMenuOpen.value) {
      envMenuRaf = null
      return
    }
    updateEnvMenuCenter()
    envMenuRaf = requestAnimationFrame(loop)
  }
  envMenuRaf = requestAnimationFrame(loop)
}

function stopEnvMenuTracking() {
  if (envMenuRaf != null) {
    cancelAnimationFrame(envMenuRaf)
    envMenuRaf = null
  }
}

function openEnvMenu(anchorWorld?: vec2, autoConfirmAfterPick = false) {
  const anchor =
    anchorWorld ??
    targets.value[targets.value.length - 1]?.pos ??
    null

  if (!anchor) return

  envMenuAutoConfirm.value = autoConfirmAfterPick
  envMenuAnchorWorld.value = { x: anchor.x, y: anchor.y }
  lastCamKey = ''
  updateEnvMenuCenter()

  envMenuOpen.value = true
  startEnvMenuTracking()
}

function closeEnvMenu() {
  envMenuOpen.value = false
  envMenuAutoConfirm.value = false
  stopEnvMenuTracking()
}

const envMenuCenterItem = computed<RadialMenuItem<EnvMenuId> | null>(() => {
  if (!targets.value.length) return null
  const active = targets.value[targets.value.length - 1]!.modifier == null
  return {
    id: 'none',
    icon: '✖',
    label: t('clear'),
    active,
    ariaLabel: t('clear'),
  }
})

const envMenuItems = computed<RadialMenuItem<EnvMenuId>[]>(() => {
  const current = targets.value.length
    ? targets.value[targets.value.length - 1]!.modifier ?? null
    : null

  return ROUTE_MODIFIERS.map((mod) => ({
    id: mod,
    icon: envIcon(mod),
    label: t(`env.${mod}`),
    active: current === mod,
    ariaLabel: t(`env.${mod}`),
  }))
})

function onEnvMenuSelect(item: RadialMenuItem<EnvMenuId>) {
  if (item.id === 'none') {
    setRouteModifier(null)
    if (envMenuAutoConfirm.value) {
      confirm()
    }
    return
  }
  setRouteModifier(item.id as UnitEnvironmentState)
  if (envMenuAutoConfirm.value) {
    confirm()
  }
}

/* ================= ABILITIES ================= */

const selectedAbilities = ref<UnitAbilityType[]>([])
function toggleAbility(a: UnitAbilityType) {
  if (selectedAbilities.value.includes(a)) {
    selectedAbilities.value = selectedAbilities.value.filter(x => x !== a)
  } else {
    selectedAbilities.value.push(a)
  }
}

const availableAbilities = computed<UnitAbilityType[]>(() => {
  const set = new Set<UnitAbilityType>()

  for (const u of movingUnits.value) {
    for (const a of u.abilities) {
      if (a === UnitAbilityType.INACCURACY_FIRE) continue
      set.add(a)
    }
  }

  return [...set]
})

/* ================= MOVE MODE ================= */

type MoveMode = 'column' | 'formation'
const moveMode = ref<MoveMode>('column')

function setMoveMode(mode: MoveMode) {
  moveMode.value = mode
  rebuildMoveOverlay()
}

/* ================= FORMATION ================= */

function getUnitPlannedPos(u: BaseUnit): vec2 {
  let p: vec2 = u.pos

  // Важно: берём ТОЛЬКО Move, и идём по очереди.
  // Если в списке уже есть несколько Move — конечной будет target последнего.
  for (const cmd of u.getCommands()) {
    if (cmd.type !== UnitCommandTypes.Move) continue
    const moveCmd = cmd as MoveCommand
    p = moveCmd.getState().state.target
  }

  return p
}

type MovePlanItem = { unit: UnwrapRef<BaseUnit>; orderIndex: number; startPos: vec2 }

/** План (порядок) колонны считается по первой точке маршрута */
const movePlan = computed<MovePlanItem[]>(() => {
  if (!movingUnits.value.length || !targets.value.length) return []

  const firstTarget = targets.value[0]!

  // заранее считаем "эффективные позиции" (конец цепочки Move)
  const unitsLeft = movingUnits.value.map(unit => ({
    unit,
    startPos: getUnitPlannedPos(unit as BaseUnit),
  }))

  const result: typeof unitsLeft = []

  // 1) ближайший к первой точке маршрута — по startPos
  let current = unitsLeft.reduce((closest, item) => {
    const d1 = Math.hypot(
      item.startPos.x - firstTarget.pos.x,
      item.startPos.y - firstTarget.pos.y
    )
    const d2 = Math.hypot(
      closest.startPos.x - firstTarget.pos.x,
      closest.startPos.y - firstTarget.pos.y
    )
    return d1 < d2 ? item : closest
  })

  result.push(current)
  unitsLeft.splice(unitsLeft.indexOf(current), 1)

  // 2) остальных — по близости к предыдущему startPos
  while (unitsLeft.length) {
    const last = current

    current = unitsLeft.reduce((closest, item) => {
      const d1 = Math.hypot(
        item.startPos.x - last.startPos.x,
        item.startPos.y - last.startPos.y
      )
      const d2 = Math.hypot(
        closest.startPos.x - last.startPos.x,
        closest.startPos.y - last.startPos.y
      )
      return d1 < d2 ? item : closest
    })

    result.push(current)
    unitsLeft.splice(unitsLeft.indexOf(current), 1)
  }

  return result.map(({ unit, startPos }, orderIndex) => ({ unit, startPos, orderIndex }))
})

const formationCenter = computed<vec2 | null>(() => {
  if (!movingUnits.value.length) return null

  const sum = movingUnits.value.reduce(
    (a, u) => {
      const uPlanPos = getUnitPlannedPos(u as BaseUnit)
      a.x += uPlanPos.x
      a.y += uPlanPos.y
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
    movingUnits.value.map(u => {
      const uPlanPos = getUnitPlannedPos(u as BaseUnit)
      return [
        u.id,
        {
          x: uPlanPos.x - formationCenter.value!.x,
          y: uPlanPos.y - formationCenter.value!.y,
        },
      ]
    })
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
    const prev = j > 0 ? targets[j-1]!.pos : plan[Math.abs(j)]!.startPos
    const next = j >= 0 ? targets[j]!.pos : plan[Math.abs(j+1)]!.startPos
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

  for (let i = currentSegmentIndex; i >= segIndex; i--) {
    const iterationSegPrev = i > 0 ? targets[i-1]!.pos : plan[Math.abs(i)]!.startPos;
    const iterationSegNext = targets[i]!.pos;
    const iterationSegment = sub(iterationSegPrev, iterationSegNext);
    let iterationLen = Math.hypot(iterationSegment.x, iterationSegment.y)

    // Считаем точки для пройденного сегмента
    for (let j = currentSegmentIndex; j >= -orderIndex+1; j--) {
      // 0-N - segments
      // -1,-2,-3 - prev units include current unit
      const prev = j > 0 ? targets[j-1]!.pos : plan[Math.abs(j)]!.startPos;
      const next = j >= 0 ? targets[j]!.pos : plan[Math.abs(j+1)]!.startPos;
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

function applyContextTarget(pos: vec2, append: boolean) {
  let modifier = null;
  if (targets.value.length) {
    modifier = targets.value[targets.value.length - 1]!.modifier ?? null;
  }

  if (append) {
    // добавить точку
    targets.value.push({pos, modifier: modifier})
  } else {
    // редактировать последнюю
    if (!targets.value.length) {
      targets.value.push({pos, modifier: modifier})
    } else {
      targets.value[targets.value.length - 1] = {pos, modifier: targets.value[targets.value.length - 1]!.modifier ?? null}
    }
  }

  rebuildMoveOverlay()
}

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

  // Shift + ПКМ — добавить точку, ПКМ — редактировать последнюю
  applyContextTarget(pos, e.shiftKey)
  openEnvMenu(pos, false)
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

    // Paint previous commands
    const unitCommands = u.getCommands()
    for (const cmd of unitCommands) {
      if (cmd.type !== UnitCommandTypes.Move) continue;
      const moveCmd = cmd as MoveCommand

      items.push({
        type: 'line',
        from,
        to: moveCmd.getState().state.target,
        color: '#22c55e',
        width: 6,
        dash: [6, 6],
        dashOffset: -1,
      })
      from = moveCmd.getState().state.target
    }

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
            color: '#22c55e',
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

function calcUnitCommandsEstimate(u: BaseUnit): { est: number, lastPos: vec2 } {
  let result = 0;
  const cmds = u.getCommands();
  let lastPos = u.pos
  for (const cmd of cmds) {
    const cmdEstimate = cmd instanceof MoveCommand ? cmd.estimate(u as BaseUnit, lastPos) : cmd.estimate(u as BaseUnit)
    if (cmdEstimate > 0 && cmdEstimate < Infinity) {
      result += cmdEstimate;
    }
    if (cmd instanceof MoveCommand) {
      lastPos = cmd.getState().state.target
    }
  }
  return {
    est: result,
    lastPos: lastPos,
  }
}

function confirm() {
  if (!movingUnits.value.length || !targets.value.length) {
    return
  }

  const uniqueId = crypto.randomUUID();

  if (!movingUnits.value.length || !targets.value.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  // используем план, чтобы порядок был стабильный
  const plan = movePlan.value

  const new_commands: Map<uuid, BaseCommand<any, any>[]> = new Map()

  plan.forEach(({ unit: u, orderIndex }, planIdx) => {
    let from = u.pos
    new_commands.set(u.id, [])

    // Compute previous commands
    const unitCommands = u.getCommands()
    for (const cmd of unitCommands) {
      if (cmd.type !== UnitCommandTypes.Move) continue;
      const moveCmd = cmd as MoveCommand
      from = moveCmd.getState().state.target
    }

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
        const cmd = new MoveCommand({
          target: {
            x: to.x,
            y: to.y,
          },
          modifier: t.modifier ?? null,
          orderIndex: orderIndex,
          uniqueId: uniqueId,
          abilities: selectedAbilities.value,
          segIndex: segIndex,
        })
        new_commands.get(u.id)!.push(cmd)
        from = to;
      }
      if (to_points.length) from = to_points[to_points.length-1]!
    }
  })

  for (const u of movingUnits.value) {
    const cmds = new_commands.get(u.id)!
    for (const cmd of cmds) {
      u.addCommand(cmd.getState())
    }
    u.setDirty()
  }

  closeEnvMenu()
  cleanup()
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
}


function cleanup() {
  closeEnvMenu()
  movingUnits.value = []
  targets.value = []
  window.ROOM_WORLD.clearOverlay()
  emit('close')
}

/* ================= LIFE CYCLE ================= */

let unsubscribe: unsub

onMounted(() => {
  movingUnits.value = [...props.units]

  window.addEventListener('pointerdown', onPointerDown)

  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason === 'overlay' || reason === 'animation' || reason === 'camera') return
    if (reason === 'select') {
      movingUnits.value = window.ROOM_WORLD.units.list().filter(u => u.selected)
    }
    rebuildMoveOverlay()
  })

  window.INPUT.IGNORE_DRAG = true;
})

onUnmounted(() => {
  unsubscribe?.()
  movingUnits.value = []
  targets.value = []
  window.removeEventListener('pointerdown', onPointerDown)
  window.ROOM_WORLD.clearOverlay()
  window.INPUT.IGNORE_DRAG = false;
  stopEnvMenuTracking()
})

defineExpose({
  confirm,
  applyContextTarget,
  setMoveMode,
  openEnvMenu,
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
          {{ i + 1 }}: {{ fmtMeters(routeDistancesMeters[i] ?? 0) }}
          <span v-if="t.modifier">{{ envIcon(t.modifier) }}</span>
        </div>
      </div>
    </div>

    <!-- ===== ABILITIES ===== -->
    <div
      v-if="availableAbilities.length"
      class="column abilities"
    >
      <div class="title">
        {{ t('command.abilities') }}
      </div>

      <div class="cards">
        <button
          v-for="a in availableAbilities"
          :key="a"
          class="card ability"
          :class="{ active: selectedAbilities.includes(a) }"
          @click="toggleAbility(a)"
        >
          {{ t(`ability.${a}`) }}
        </button>
      </div>
    </div>

    <!-- ===== ENV MODIFIER ===== -->
    <RadialMenu
      :open="envMenuOpen"
      :center="envMenuCenter"
      :items="envMenuItems"
      :center-item="envMenuCenterItem"
      :show-labels="false"
      :close-on-backdrop="false"
      :close-on-esc="false"
      @select="(item) => onEnvMenuSelect(item)"
      @close="closeEnvMenu"
    />

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button
        class="btn confirm"
        :disabled="!targets.length"
        @click="confirm"
        :title="`${t('hotkey')}: E`"
      >
        {{ t('tools.command.move') }}
      </button>
      <button class="btn cancel" @click="emit('close')" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
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
  background: var(--panel);
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

.column.abilities {
  min-width: 140px;
}

.card.ability {
  cursor: pointer;
  font-size: 10px;
  color: #94a3b8;
  user-select: none;
}

.card.ability:hover {
  border-color: #64748b;
}

.card.ability.active {
  color: #22c55e;
  border-color: #22c55e;
  background: #052e16;
}
</style>

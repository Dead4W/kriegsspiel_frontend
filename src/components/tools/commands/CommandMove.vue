<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch, type UnwrapRef} from 'vue'
import {BaseUnit} from '@/engine/units/baseUnit'
import type {OverlayItem} from '@/engine/types/overlayTypes'
import type {vec2} from '@/engine/types'
import {MoveCommand, type MoveCommandState} from '@/engine/units/commands/moveCommand'
import {useI18n} from 'vue-i18n'
import {getTeamColor} from '@/engine/2d/render'
import {type commandstate, type unitTeam, unitType, type uuid} from '@/engine'
import type {unsub} from '@/engine/events'
import {unitlayer} from "@/engine/2d/render";
import { CLIENT_SETTING_KEYS } from "@/enums/clientSettingsKeys.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {Team} from "@/enums/teamKeys.ts";
import type {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import { hasAbilityInaccuracyRadius } from "@/engine/resourcePack/abilities.ts";
import type {BaseCommand} from "@/engine/units/commands/baseCommand.ts";
import {canPlayerUseDirectViewOrder} from "@/engine/units/directViewOrderRules.ts";
import RadialMenu, { type RadialMenuItem } from '@/components/ui/RadialMenu.vue'
import HotkeyTag from '@/components/ui/HotkeyTag.vue'
import {
  getEnvironmentIcon,
  getRouteEnvironmentStates,
  type EnvironmentStateId,
} from "@/engine/resourcePack/environment.ts";
import {
  buildColumnPlanByFirstTargetDistance,
  getColumnPosition,
  getColumnSegmentRoutePoints,
  mergeColumnFirstSegmentWithSmartPath,
  type ColumnPlanItem as ColumnAlgoPlanItem,
} from "@/engine/units/formationMoveAlgorithms/columnAlgorithms.ts";
import {
  buildFormationCenter,
  buildFormationOffsets,
  getFormationSegmentAngles,
  getFormationReferenceAngle,
  getFormationTargetPoint,
} from "@/engine/units/formationMoveAlgorithms/formationAlgorithms.ts";

const { t } = useI18n()

function teamColor(team: unitTeam) {
  const { r, g, b } = getTeamColor(team)
  return `rgba(${r},${g},${b}, 1)`
}

/* ================= Helpers ======================== */

function envIcon(state: EnvironmentStateId) {
  return getEnvironmentIcon(state)
}

function shouldRenderMoveLine(
  segIndex: number | undefined,
  orderIndex: number | undefined,
  lastOrderIndex?: number
) {
  const normalizedOrderIndex = orderIndex ?? 0
  const isLastOrder = lastOrderIndex != null && normalizedOrderIndex === lastOrderIndex
  return (segIndex ?? 0) === 0 || normalizedOrderIndex === 0 || isLastOrder
}

function setRouteModifier(mod: EnvironmentStateId | null) {
  if (!targets.value.length) return
  targets.value[targets.value.length - 1]!.modifier = mod
  rebuildMoveOverlay()
}

/* ================= props / emits ================= */

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/* ================= SNAPSHOT ================= */

const ROUTE_MODIFIERS = computed(() => getRouteEnvironmentStates())

export type RoutePoint = {
  pos: vec2
  modifier?: EnvironmentStateId | null
}

const movingUnits = ref<BaseUnit[]>([])
const targets = ref<RoutePoint[]>([])
const isPatrol = ref(false)
const smartPathEnabled = ref(false)
const routeListRef = ref<HTMLElement | null>(null)

/* ================= DISTANCE (meters) ================= */

function distPx(a: vec2, b: vec2) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function getFacingAngleFromSegment(from: vec2, to: vec2, fallback: number): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return fallback

  const tau = Math.PI * 2
  const angle = Math.atan2(dy, dx) + Math.PI / 2
  return ((angle % tau) + tau) % tau
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

const hasObjectMap = computed(() => {
  return Boolean(
    window.ROOM_WORLD.objectMapImageData
    && window.ROOM_WORLD.objectMapColorToEntity.size > 0
  )
})
const isAdmin = computed(() => window.PLAYER.team === Team.ADMIN)

function fmtMeters(meters: number) {
  return `${Math.round(meters)} m`
}

function loadSmartPathPreference(units: Array<{ type: unitType }>) {
  if (!hasObjectMap.value) {
    smartPathEnabled.value = false
    return
  }
  if (!isAdmin.value) {
    smartPathEnabled.value = moveMode.value === 'column'
    return
  }

  const isSingleMessenger =
    units.length === 1
    && units[0]!.type === unitType.MESSENGER
  if (isSingleMessenger) {
    smartPathEnabled.value = true
    return
  }
  smartPathEnabled.value = Boolean(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.MOVE_SMART_PATH]
  )
}

function onSmartPathToggle(nextValue: boolean) {
  if (!isAdmin.value) return
  if (moveMode.value === 'formation' || !hasObjectMap.value) return
  smartPathEnabled.value = nextValue
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.MOVE_SMART_PATH] = nextValue
  rebuildRouteBySmartPathMode()
}

function enforceSmartPathAvailability() {
  if (hasObjectMap.value) return
  if (!smartPathEnabled.value) return
  smartPathEnabled.value = false
  rebuildRouteBySmartPathMode()
}

function getSegmentRoutePoints(from: vec2, to: vec2): vec2[] {
  if (moveMode.value === 'formation') {
    return [{ x: to.x, y: to.y }]
  }
  return getColumnSegmentRoutePoints(
    window.ROOM_WORLD,
    from,
    to,
    smartPathEnabled.value,
    hasObjectMap.value
  )
}

function rebuildRouteBySmartPathMode() {
  if (!targets.value.length) {
    rebuildMoveOverlay()
    return
  }

  const lastTarget = targets.value[targets.value.length - 1]!
  const start = routeStartPos.value
    ?? getNearestSelectedUnitPlannedPos(lastTarget.pos)
    ?? lastTarget.pos
  const rebuiltPoints = getSegmentRoutePoints(start, lastTarget.pos)

  targets.value = rebuiltPoints.map((point) => ({
    pos: point,
    modifier: lastTarget.modifier ?? null,
  }))
  rebuildMoveOverlay()
}

function minDistanceToSelectedUnits(point: vec2, unitPositions: vec2[]): number {
  if (!unitPositions.length) return Infinity
  let minDist = Infinity
  for (const unitPos of unitPositions) {
    const dist = Math.hypot(point.x - unitPos.x, point.y - unitPos.y)
    if (dist < minDist) minDist = dist
  }
  return minDist
}

function trimRouteHeadByNearestUnitDistance(routePoints: vec2[], unitPositions: vec2[]): vec2[] {
  if (routePoints.length <= 1 || !unitPositions.length) return [...routePoints]
  let headIndex = 0
  while (headIndex < routePoints.length - 1) {
    const currentDist = minDistanceToSelectedUnits(routePoints[headIndex]!, unitPositions)
    const nextDist = minDistanceToSelectedUnits(routePoints[headIndex + 1]!, unitPositions)
    // Если следующая точка не дальше ближайшего юнита, текущую стартовую точку убираем.
    if (nextDist <= currentDist) {
      headIndex += 1
      continue
    }
    break
  }
  return routePoints.slice(headIndex)
}

function normalizeInitialRoutePoints(routePoints: vec2[]): vec2[] {
  if (!routePoints.length || !movingUnits.value.length) return routePoints
  const unitPositions = movingUnits.value.map((u) => getUnitPlannedPos(u as BaseUnit))

  // Обрезаем старт не по всем выбранным юнитам, а только по локальному "стартовому"
  // кластеру у начала маршрута. Иначе длинная колонна (два хвоста) может протолкнуть
  // первую A* точку слишком далеко вперед, мимо ближайшего перекрестка/поворота.
  const routeHead = routePoints[0]!
  const anchor = unitPositions.reduce((best, p) => {
    if (!best) return p
    const bestDist = Math.hypot(best.x - routeHead.x, best.y - routeHead.y)
    const pDist = Math.hypot(p.x - routeHead.x, p.y - routeHead.y)
    return pDist < bestDist ? p : best
  }, null as vec2 | null)
  const localClusterRadius = Math.max(BaseUnit.COLLISION_RANGE * 2, 20)
  const localUnitPositions = anchor
    ? unitPositions.filter((p) =>
      Math.hypot(p.x - anchor.x, p.y - anchor.y) <= localClusterRadius
    )
    : unitPositions
  const normalizeByPositions = localUnitPositions.length ? localUnitPositions : unitPositions

  const trimmed = trimRouteHeadByNearestUnitDistance(routePoints, normalizeByPositions)
  if (trimmed.length <= 1) return trimmed

  // Убираем стартовые точки только пока они внутри локальной стартовой группы.
  const minClearance = Math.max(8, BaseUnit.COLLISION_RANGE * 0.45)
  let keepFrom = 0
  while (keepFrom < trimmed.length - 1) {
    const dist = minDistanceToSelectedUnits(trimmed[keepFrom]!, normalizeByPositions)
    if (dist > minClearance) break
    keepFrom += 1
  }
  return trimmed.slice(keepFrom)
}

function getNearestSelectedUnitPlannedPos(point: vec2): vec2 | null {
  if (!movingUnits.value.length) return null
  let bestPos: vec2 | null = null
  let bestDist = Infinity
  for (const unit of movingUnits.value) {
    const pos = getUnitPlannedPos(unit as BaseUnit)
    const dist = Math.hypot(pos.x - point.x, pos.y - point.y)
    if (dist < bestDist) {
      bestDist = dist
      bestPos = pos
    }
  }
  return bestPos ? { x: bestPos.x, y: bestPos.y } : null
}

/* ================= ENV MENU (radial) ================= */

type EnvMenuId = EnvironmentStateId | 'none'

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

  return ROUTE_MODIFIERS.value.map((mod) => ({
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
  setRouteModifier(item.id)
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
      if (hasAbilityInaccuracyRadius(a)) continue
      set.add(a)
    }
  }

  return [...set]
})

/* ================= MOVE MODE ================= */

type MoveMode = 'column' | 'formation'
const moveMode = ref<MoveMode>('column')

function setMoveMode(mode: MoveMode) {
  if (moveMode.value === mode) return
  moveMode.value = mode
  if (mode === 'formation') {
    smartPathEnabled.value = false
  } else if (!isAdmin.value) {
    smartPathEnabled.value = hasObjectMap.value
  }
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

function getFirstActiveMoveState(unit: BaseUnit): MoveCommandState | null {
  const activeMove = unit.getCommands().find(
    (cmd) => cmd.type === UnitCommandTypes.Move && !cmd.isFinished(unit)
  )
  if (!activeMove) return null
  return (activeMove as MoveCommand).getState().state
}

/** План (порядок) колонны считается по первой точке маршрута */
const movePlan = computed<MovePlanItem[]>(() => {
  if (!movingUnits.value.length || !targets.value.length) return []

  const firstTarget = targets.value[0]!

  // заранее считаем "эффективные позиции" (конец цепочки Move)
  const unitsLeft = movingUnits.value.map((unit) => ({
    unit,
    startPos: getUnitPlannedPos(unit as BaseUnit),
  }))

  // Если все выбранные юниты уже идут в одной колонне, сохраняем текущий порядок.
  // Это предотвращает "переламывание" колонны при постановке приказа из середины.
  const orderByExistingColumn = (() => {
    const groupedByMove = new Map<string, Array<{ unit: BaseUnit; orderIndex: number }>>()
    for (const unit of movingUnits.value) {
      const moveState = getFirstActiveMoveState(unit as BaseUnit)
      if (!moveState || !moveState.uniqueId || !Number.isFinite(moveState.orderIndex)) continue
      const existing = groupedByMove.get(moveState.uniqueId)
      const item = { unit: unit as BaseUnit, orderIndex: moveState.orderIndex }
      if (existing) {
        existing.push(item)
      } else {
        groupedByMove.set(moveState.uniqueId, [item])
      }
    }

    for (const group of groupedByMove.values()) {
      if (group.length !== movingUnits.value.length) continue
      const uniqOrder = new Set(group.map((item) => item.orderIndex))
      if (uniqOrder.size !== group.length) continue
      return group
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((item) => item.unit.id)
    }
    return null
  })()

  if (orderByExistingColumn) {
    const startPosByUnitId = new Map(
      unitsLeft.map(({ unit, startPos }) => [unit.id, startPos] as const)
    )
    return orderByExistingColumn
      .map((unitId) => {
        const unit = movingUnits.value.find((item) => item.id === unitId)
        if (!unit) return null
        const startPos = startPosByUnitId.get(unitId)
        if (!startPos) return null
        return { unit, startPos }
      })
      .filter((item): item is { unit: UnwrapRef<BaseUnit>; startPos: vec2 } => Boolean(item))
      .map(({ unit, startPos }, orderIndex) => ({ unit, startPos, orderIndex }))
  }

  const algoPlan = buildColumnPlanByFirstTargetDistance(
    unitsLeft.map(({ unit, startPos }) => ({ unitId: unit.id, startPos })),
    firstTarget.pos
  )

  const unitById = new Map(unitsLeft.map((item) => [item.unit.id, item.unit] as const))
  return algoPlan
    .map((item) => {
      const unit = unitById.get(item.unitId)
      if (!unit) return null
      return { unit, startPos: item.startPos, orderIndex: item.orderIndex }
    })
    .filter((item): item is MovePlanItem => Boolean(item))
})

const formationCenter = computed<vec2 | null>(() => buildFormationCenter(
  movingUnits.value.map((unit) => ({
    unitId: unit.id,
    startPos: getUnitPlannedPos(unit as BaseUnit),
  }))
))

const formationOffsets = computed<Record<uuid, vec2>>(() => {
  const offsets = buildFormationOffsets(
    movingUnits.value.map((unit) => ({
      unitId: unit.id,
      startPos: getUnitPlannedPos(unit as BaseUnit),
    })),
    formationCenter.value
  )
  return offsets as Record<uuid, vec2>
})

function isSegmentLongEnoughMeters(from: vec2, to: vec2, minMeters = 30): boolean {
  const metersPerPixel = window.ROOM_WORLD?.map?.metersPerPixel ?? 1
  const distMeters = Math.hypot(to.x - from.x, to.y - from.y) * metersPerPixel
  return distMeters >= minMeters
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
  const snappedPos =
    moveMode.value === 'column'
      ? (
        window.ROOM_WORLD.findNearestObjectLocalCenter(pos, ['good_road', 'road'], 30, 12)?.center
        ?? window.ROOM_WORLD.findNearestObjectPoint(pos, ['good_road', 'road'], 30)
        ?? pos
      )
      : pos
  const modifier = targets.value[targets.value.length - 1]?.modifier ?? null

  if (append) {
    const start = targets.value[targets.value.length - 1]?.pos ?? routeStartPos.value ?? snappedPos
    const rawRoutePoints = getSegmentRoutePoints(start, snappedPos)
    const normalizedRoutePoints = targets.value.length
      ? rawRoutePoints
      : normalizeInitialRoutePoints(rawRoutePoints)
    const routePoints = normalizedRoutePoints
    for (const point of routePoints) {
      targets.value.push({ pos: point, modifier })
    }
    nextTick(() => {
      routeListRef.value?.scrollTo({ top: routeListRef.value.scrollHeight, behavior: 'smooth' })
    })
  } else {
    const hasTargets = targets.value.length > 0
    const nearestSelectedStart = getNearestSelectedUnitPlannedPos(snappedPos)
    const start = hasTargets
      ? (targets.value.length > 1
        ? targets.value[targets.value.length - 2]!.pos
        : routeStartPos.value ?? targets.value[0]!.pos)
      : (nearestSelectedStart ?? routeStartPos.value ?? snappedPos)
    const rawRoutePoints = getSegmentRoutePoints(start, snappedPos)
    const normalizedRoutePoints = ((!hasTargets)
      ? normalizeInitialRoutePoints(rawRoutePoints)
      : rawRoutePoints
    )
    const routePoints = normalizedRoutePoints
      .map((point) => ({ pos: point, modifier }))

    if (!hasTargets) {
      targets.value = routePoints
    } else {
      targets.value.splice(targets.value.length - 1, 1, ...routePoints)
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

  applyContextTarget(pos, true)
  if (isAdmin.value) {
    openEnvMenu(undefined, false)
  }
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
  const routePoints = targets.value.map((item) => item.pos)
  const columnAlgoPlan: ColumnAlgoPlanItem[] = plan.map((item) => ({
    unitId: item.unit.id,
    startPos: item.startPos,
    orderIndex: item.orderIndex,
  }))
  const formationSegmentAngles = getFormationSegmentAngles(
    formationCenter.value,
    routePoints,
    window.ROOM_WORLD?.map?.metersPerPixel ?? 1,
    8
  )
  const formationRefAngle = getFormationReferenceAngle(formationSegmentAngles)

  plan.forEach(({ unit: u, orderIndex }, planIdx) => {
    const lastPlanOrderIndex = plan.length - 1
    let from = u.pos
    let lastMoveSegment: { from: vec2; to: vec2 } | null = null

    // Paint previous commands
    const unitCommands = u.getCommands()
    for (const cmd of unitCommands) {
      if (cmd.type !== UnitCommandTypes.Move) continue;
      const moveCmd = cmd as MoveCommand
      const moveState = moveCmd.getState().state as MoveCommandState
      const target = moveState.target

      if (shouldRenderMoveLine(moveState.segIndex, moveState.orderIndex, lastPlanOrderIndex)) {
        items.push({
          type: 'line',
          from,
          to: target,
          color: 'rgba(34,197,94,0.65)',
          width: 6,
          dash: [6, 6],
          dashOffset: -1,
        })
      }
      lastMoveSegment = { from, to: target }
      from = target
    }

    for (let segIndex = 0; segIndex < targets.value.length; segIndex++) {
      const t = targets.value[segIndex]!

      let to_points: vec2[] = [];

      if (moveMode.value === 'formation' && formationOffsets.value[u.id]) {
        to_points = [getFormationTargetPoint(
          segIndex,
          t.pos,
          formationOffsets.value[u.id],
          formationSegmentAngles,
          formationRefAngle
        )]
      } else if (moveMode.value === 'column') {
        to_points = getColumnPosition(
          segIndex,
          orderIndex,
          routePoints,
          columnAlgoPlan,
          BaseUnit.COLLISION_RANGE
        )
        if (segIndex === 0) {
          to_points = mergeColumnFirstSegmentWithSmartPath(
            window.ROOM_WORLD,
            from,
            to_points,
            smartPathEnabled.value,
            hasObjectMap.value
          )
        }
      } else {
        to_points = [t.pos]
      }

      for (const to of to_points) {
        const isLongEnough = isSegmentLongEnoughMeters(from, to, 30)
        if (shouldRenderMoveLine(segIndex, orderIndex, lastPlanOrderIndex)) {
          items.push({
            type: 'line',
            from,
            to,
            color: 'rgba(34,197,94,0.65)',
            width: 6,
            dash: [6, 6],
            dashOffset: -1,
          })
        }
        if (isLongEnough) {
          lastMoveSegment = { from, to }
        }
        from = to;
      }

      if (segIndex === targets.value.length-1) {
        const to = to_points.length ? to_points[to_points.length-1]! : u.pos;
        const previewAngle = lastMoveSegment
          ? getFacingAngleFromSegment(lastMoveSegment.from, lastMoveSegment.to, u.angle)
          : u.angle
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
            angle: previewAngle,
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
  const shouldSendDirectViewOrder = canPlayerUseDirectViewOrder(movingUnits.value)

  if (!movingUnits.value.length || !targets.value.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  // используем план, чтобы порядок был стабильный
  const plan = movePlan.value

  const new_commands: Map<uuid, BaseCommand<any, any>[]> = new Map()
  const routeTargets = [...targets.value]
  const routePoints = routeTargets.map((item) => item.pos)
  const columnAlgoPlan: ColumnAlgoPlanItem[] = plan.map((item) => ({
    unitId: item.unit.id,
    startPos: item.startPos,
    orderIndex: item.orderIndex,
  }))
  const formationSegmentAngles = getFormationSegmentAngles(
    formationCenter.value,
    routePoints,
    window.ROOM_WORLD?.map?.metersPerPixel ?? 1,
    8
  )
  const formationRefAngle = getFormationReferenceAngle(formationSegmentAngles)

  plan.forEach(({ unit: u, orderIndex }) => {
    const unit = u as BaseUnit
    let from = unit.pos
    new_commands.set(unit.id, [])

    // Compute previous commands
    const unitCommands = unit.getCommands()
    for (const cmd of unitCommands) {
      if (cmd.type !== UnitCommandTypes.Move) continue;
      const moveCmd = cmd as MoveCommand
      from = moveCmd.getState().state.target
    }

    for (let segIndex = 0; segIndex < routeTargets.length; segIndex++) {
      const t = routeTargets[segIndex]!

      let to_points: vec2[] = [];

      if (moveMode.value === 'formation' && formationOffsets.value[u.id]) {
        to_points = [getFormationTargetPoint(
          segIndex,
          t.pos,
          formationOffsets.value[u.id],
          formationSegmentAngles,
          formationRefAngle
        )]
      } else if (moveMode.value === 'column') {
        to_points = getColumnPosition(
          segIndex,
          orderIndex,
          routePoints,
          columnAlgoPlan,
          BaseUnit.COLLISION_RANGE
        )
        if (segIndex === 0) {
          to_points = mergeColumnFirstSegmentWithSmartPath(
            window.ROOM_WORLD,
            from,
            to_points,
            smartPathEnabled.value,
            hasObjectMap.value
          )
        }
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
          orderIndex: moveMode.value === 'column' ? orderIndex : 0,
          uniqueId: uniqueId,
          abilities: selectedAbilities.value,
          segIndex: segIndex,
          isPatrol: isPatrol.value,
        })
        new_commands.get(u.id)!.push(cmd)
        from = to;
      }
      if (to_points.length) from = to_points[to_points.length-1]!
    }
  })

  for (const u of movingUnits.value) {
    const cmds = new_commands.get(u.id)!
    u.manualEnvironment = null
    for (const cmd of cmds) {
      u.addCommand(cmd.getState())
    }
    u.setDirty()
  }

  if (shouldSendDirectViewOrder) {
    for (const selectedUnit of movingUnits.value) {
      const moveCommands = selectedUnit
        .getCommands()
        .map((cmd) => cmd.getState() as commandstate)
        .filter((cmd) => cmd.type === UnitCommandTypes.Move)
      window.ROOM_WORLD.events.emit('api', {
        type: 'direct_view_send_order',
        team: window.PLAYER.team,
        data: {
          unitId: selectedUnit.id,
          commands: moveCommands,
        },
      })
    }
  }

  closeEnvMenu()
  cleanup()
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });
}


function cleanup() {
  closeEnvMenu()
  movingUnits.value = []
  targets.value = []
  isPatrol.value = false
  window.ROOM_WORLD.clearOverlay()
  emit('close')
}

/* ================= LIFE CYCLE ================= */

let unsubscribe: unsub

onMounted(() => {
  movingUnits.value = [...props.units]
  loadSmartPathPreference(movingUnits.value)
  enforceSmartPathAvailability()

  window.addEventListener('pointerdown', onPointerDown)

  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason === 'overlay' || reason === 'animation' || reason === 'camera') return
    if (reason === 'select') {
      movingUnits.value = window.ROOM_WORLD.units.list().filter(u => u.selected)
      if (!targets.value.length) {
        loadSmartPathPreference(movingUnits.value)
      }
    }
    enforceSmartPathAvailability()
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

watch(hasObjectMap, () => {
  enforceSmartPathAvailability()
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
        ref="routeListRef"
        class="target-pos route-list"
      >
        <div v-for="(t, i) in targets" :key="i">
          {{ i + 1 }}: {{ fmtMeters(routeDistancesMeters[i] ?? 0) }}
          <span v-if="t.modifier">{{ envIcon(t.modifier) }}</span>
        </div>
      </div>

      <label v-if="isAdmin && hasObjectMap" class="smart-path-toggle">
        <input
          type="checkbox"
          class="smart-path-toggle-input"
          :checked="smartPathEnabled && hasObjectMap && moveMode !== 'formation'"
          :disabled="moveMode === 'formation' || !hasObjectMap"
          @change="onSmartPathToggle(($event.target as HTMLInputElement).checked)"
        >
        <span class="smart-path-toggle-switch" aria-hidden="true"></span>
        <span class="smart-path-toggle-label">{{ t('tools.command.smartPath') }}</span>
      </label>
    </div>

    <!-- ===== ABILITIES ===== -->
    <div
      v-if="isAdmin && availableAbilities.length"
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
        v-if="isAdmin"
        class="btn patrol"
        :class="{ active: isPatrol }"
        :disabled="!targets.length"
        @click="isPatrol = !isPatrol"
      >
        {{ t('tools.command.patrol') }}
      </button>
      <button
        class="btn confirm"
        :disabled="!targets.length"
        @click="confirm"
        :title="`${t('hotkey')}: E`"
      >
        {{ t('tools.command.apply') }}
        <HotkeyTag key-label="E" />
      </button>
      <button class="btn cancel" @click="emit('close')" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
        <HotkeyTag key-label="Q" />
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

.target-pos.route-list {
  max-height: 120px;
  overflow-y: auto;
}

.smart-path-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #cbd5e1;
  user-select: none;
  cursor: pointer;
}

.smart-path-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.smart-path-toggle-switch {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid #334155;
  background: #0f172a;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.smart-path-toggle-switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #94a3b8;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.smart-path-toggle-input:checked + .smart-path-toggle-switch {
  background: rgba(56, 189, 248, 0.22);
  border-color: #38bdf8;
}

.smart-path-toggle-input:checked + .smart-path-toggle-switch::after {
  transform: translateX(12px);
  background: #38bdf8;
}

.smart-path-toggle-input:focus-visible + .smart-path-toggle-switch {
  outline: 2px solid rgba(56, 189, 248, 0.35);
  outline-offset: 2px;
}

.smart-path-toggle-label {
  color: #cbd5e1;
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
  position: relative;
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

.btn.patrol {
  color: #38bdf8;
}

.btn.patrol.active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
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

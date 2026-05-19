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
import {normalize, sub} from "@/engine/math.ts";
import { CLIENT_SETTING_KEYS } from "@/enums/clientSettingsKeys.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import { hasAbilityInaccuracyRadius } from "@/engine/resourcePack/abilities.ts";
import type {BaseCommand} from "@/engine/units/commands/baseCommand.ts";
import {WaitCommand} from "@/engine/units/commands/waitCommand.ts";
import RadialMenu, { type RadialMenuItem } from '@/components/ui/RadialMenu.vue'
import HotkeyTag from '@/components/ui/HotkeyTag.vue'
import {
  getEnvironmentIcon,
  getRouteEnvironmentStates,
  type EnvironmentStateId,
} from "@/engine/resourcePack/environment.ts";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath.ts";

const { t } = useI18n()

function teamColor(team: unitTeam) {
  const { r, g, b } = getTeamColor(team)
  return `rgba(${r},${g},${b}, 1)`
}

/* ================= Helpers ======================== */

function envIcon(state: EnvironmentStateId) {
  return getEnvironmentIcon(state)
}

function setRouteModifier(mod: EnvironmentStateId | null) {
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
const MIN_ROUTE_SEGMENT_METERS = 20

/* ================= DISTANCE (meters) ================= */

function distPx(a: vec2, b: vec2) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pruneTinyRouteSegments(start: vec2, points: vec2[], minSegmentMeters = MIN_ROUTE_SEGMENT_METERS): vec2[] {
  if (points.length <= 1) return [...points]

  const mpp = window.ROOM_WORLD?.map?.metersPerPixel ?? 1
  const out: vec2[] = []
  let prev = start

  for (const point of points) {
    const segMeters = distPx(prev, point) * mpp
    if (segMeters >= minSegmentMeters) {
      out.push(point)
      prev = point
      continue
    }

    // Last point is always kept: for short residual tail
    // we overwrite previous waypoint with final destination.
    if (point === points[points.length - 1]) {
      if (out.length) {
        out[out.length - 1] = point
      } else {
        out.push(point)
      }
      prev = point
    }
  }

  if (!out.length) {
    return [{ x: points[points.length - 1]!.x, y: points[points.length - 1]!.y }]
  }
  return out
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

function fmtMeters(meters: number) {
  return `${Math.round(meters)} m`
}

function loadSmartPathPreference(units: Array<{ type: unitType }>) {
  if (!hasObjectMap.value) {
    smartPathEnabled.value = false
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
  if (!smartPathEnabled.value || !hasObjectMap.value) {
    return [{ x: to.x, y: to.y }]
  }
  return buildRoadTurnRoutePoints(window.ROOM_WORLD, from, to)
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

function resolveColumnDirection(routeTargets: RoutePoint[], unitStartPositions: vec2[]): vec2 {
  const minLen = Math.max(1e-3, BaseUnit.COLLISION_RANGE * 0.15)

  // 1) Основной источник: первый достаточно длинный сегмент маршрута.
  for (let i = 1; i < routeTargets.length; i++) {
    const from = routeTargets[i - 1]!.pos
    const to = routeTargets[i]!.pos
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy)
    if (len >= minLen) {
      return { x: dx / len, y: dy / len }
    }
  }

  // 2) Для случая "одна точка" (часто в smart path после нормализации):
  // направление от центра группы к первой цели.
  const firstTarget = routeTargets[0]?.pos
  if (firstTarget && unitStartPositions.length) {
    let cx = 0
    let cy = 0
    for (const p of unitStartPositions) {
      cx += p.x
      cy += p.y
    }
    cx /= unitStartPositions.length
    cy /= unitStartPositions.length

    const dx = firstTarget.x - cx
    const dy = firstTarget.y - cy
    const len = Math.hypot(dx, dy)
    if (len >= 1e-6) {
      return { x: dx / len, y: dy / len }
    }
  }

  return { x: 1, y: 0 }
}

function buildColumnPlanByNearestChain(
  unitsLeft: Array<{ unit: UnwrapRef<BaseUnit>; startPos: vec2 }>,
  direction: vec2,
  firstTarget: vec2
): MovePlanItem[] {
  if (!unitsLeft.length) return []
  const nx = direction.x
  const ny = direction.y
  const px = -ny
  const py = nx

  const remaining = [...unitsLeft]
  remaining.sort((a, b) => {
    // Голова должна быть "с одного края" — берем самый передний юнит по оси движения.
    const alongA = a.startPos.x * nx + a.startPos.y * ny
    const alongB = b.startPos.x * nx + b.startPos.y * ny
    if (Math.abs(alongA - alongB) > 0.001) return alongB - alongA

    // Tie-breakers для стабильности.
    const distToTargetA = Math.hypot(a.startPos.x - firstTarget.x, a.startPos.y - firstTarget.y)
    const distToTargetB = Math.hypot(b.startPos.x - firstTarget.x, b.startPos.y - firstTarget.y)
    if (Math.abs(distToTargetA - distToTargetB) > 0.001) return distToTargetA - distToTargetB

    const lateralA = a.startPos.x * px + a.startPos.y * py
    const lateralB = b.startPos.x * px + b.startPos.y * py
    if (Math.abs(lateralA - lateralB) > 0.001) return lateralA - lateralB

    return String(a.unit.id).localeCompare(String(b.unit.id))
  })

  const ordered: Array<{ unit: UnwrapRef<BaseUnit>; startPos: vec2 }> = [remaining.shift()!]
  let prev = ordered[0]!.startPos

  // Остальные индексы строим цепочкой: ближайший к предыдущему.
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i]!.startPos
      const dist = Math.hypot(p.x - prev.x, p.y - prev.y)
      if (dist + 0.001 < bestDist) {
        bestDist = dist
        bestIdx = i
        continue
      }
      if (Math.abs(dist - bestDist) <= 0.001) {
        const candidateAlong = p.x * nx + p.y * ny
        const currentBest = remaining[bestIdx]!.startPos
        const bestAlong = currentBest.x * nx + currentBest.y * ny
        if (candidateAlong > bestAlong) {
          bestIdx = i
        }
      }
    }
    const [next] = remaining.splice(bestIdx, 1)
    ordered.push(next!)
    prev = next!.startPos
  }

  return ordered.map(({ unit, startPos }, orderIndex) => ({ unit, startPos, orderIndex }))
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

  const dir = resolveColumnDirection(
    targets.value,
    unitsLeft.map(({ startPos }) => startPos)
  )
  return buildColumnPlanByNearestChain(unitsLeft, dir, firstTarget.pos)
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

function getRouteSegmentAngle(from: vec2, to: vec2): number | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return null
  return Math.atan2(dy, dx)
}

function isSegmentLongEnoughMeters(from: vec2, to: vec2, minMeters = 30): boolean {
  const metersPerPixel = window.ROOM_WORLD?.map?.metersPerPixel ?? 1
  const distMeters = Math.hypot(to.x - from.x, to.y - from.y) * metersPerPixel
  return distMeters >= minMeters
}

function rotateVector(v: vec2, angle: number): vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  }
}

function getFormationSegmentAngles(
  routeTargets: RoutePoint[],
  _source: 'overlay' | 'confirm',
): Array<number | null> {
  const result: Array<number | null> = []
  if (!formationCenter.value || !routeTargets.length) return result
  const minSegmentMeters = 8
  let lastAngle: number | null = null
  for (let i = 0; i < routeTargets.length; i++) {
    const segFrom = i === 0 ? formationCenter.value : routeTargets[i - 1]!.pos
    const segTo = routeTargets[i]!.pos
    const nextAngle = getRouteSegmentAngle(segFrom!, segTo)
    if (nextAngle != null && isSegmentLongEnoughMeters(segFrom!, segTo, minSegmentMeters)) {
      lastAngle = nextAngle
    }
    result.push(lastAngle)
  }

  return result
}

function getFormationReferenceAngle(segmentAngles: Array<number | null>): number | null {
  return segmentAngles[0] ?? null
}

function getFormationTargetPoint(
  segIndex: number,
  unitId: uuid,
  target: vec2,
  routeTargets: RoutePoint[],
  segmentAngles: Array<number | null>,
  refAngle: number | null
): vec2 {
  const offset = formationOffsets.value[unitId]
  if (!offset) return target

  if (refAngle == null) {
    return {
      x: target.x + offset.x,
      y: target.y + offset.y,
    }
  }

  const segAngle = segmentAngles[segIndex] ?? refAngle
  if (segAngle == null) {
    return {
      x: target.x + offset.x,
      y: target.y + offset.y,
    }
  }

  const rotatedOffset = rotateVector(offset, segAngle - refAngle)
  return {
    x: target.x + rotatedOffset.x,
    y: target.y + rotatedOffset.y,
  }
}

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
    const routePoints = pruneTinyRouteSegments(start, normalizedRoutePoints)
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
    const routePoints = pruneTinyRouteSegments(start, normalizedRoutePoints)
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
  openEnvMenu(undefined, false)
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
  const formationSegmentAngles = getFormationSegmentAngles(targets.value, 'overlay')
  const formationRefAngle = getFormationReferenceAngle(formationSegmentAngles)

  plan.forEach(({ unit: u, orderIndex }, planIdx) => {
    let from = u.pos
    let lastMoveSegment: { from: vec2; to: vec2 } | null = null

    // Paint previous commands
    const unitCommands = u.getCommands()
    for (const cmd of unitCommands) {
      if (cmd.type !== UnitCommandTypes.Move) continue;
      const moveCmd = cmd as MoveCommand
      const target = moveCmd.getState().state.target

      items.push({
        type: 'line',
        from,
        to: target,
        color: 'rgba(34,197,94,0.65)',
        width: 6,
        dash: [6, 6],
        dashOffset: -1,
      })
      lastMoveSegment = { from, to: target }
      from = target
    }

    for (let segIndex = 0; segIndex < targets.value.length; segIndex++) {
      const t = targets.value[segIndex]!

      let to_points: vec2[] = [];

      if (moveMode.value === 'formation' && formationOffsets.value[u.id]) {
        to_points = [getFormationTargetPoint(
          segIndex,
          u.id,
          t.pos,
          targets.value,
          formationSegmentAngles,
          formationRefAngle
        )]
      } else if (moveMode.value === 'column') {
        to_points = getColumnPosition(segIndex, orderIndex, targets.value, plan)
      } else {
        to_points = [t.pos]
      }

      for (const to of to_points) {
        const isLongEnough = isSegmentLongEnoughMeters(from, to, 30)
          items.push({
            type: 'line',
            from,
            to,
            color: 'rgba(34,197,94,0.65)',
            width: 6,
            dash: [6, 6],
            dashOffset: -1,
          })
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
  const routeTargets = [...targets.value]
  const formationSegmentAngles = getFormationSegmentAngles(routeTargets, 'confirm')
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
          u.id,
          t.pos,
          routeTargets,
          formationSegmentAngles,
          formationRefAngle
        )]
      } else if (moveMode.value === 'column') {
        to_points = getColumnPosition(segIndex, orderIndex, routeTargets, plan)
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

      <label v-if="hasObjectMap" class="smart-path-toggle">
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

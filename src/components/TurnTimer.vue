<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {Team} from '@/enums/teamKeys'
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import type {unitTeam} from "@/engine";
import {buildVisionPolygon, pointInPolygon} from "@/engine/2d/render";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys";
import type {TimeOfDay} from "@/engine/resourcePack/timeOfDay.ts";
import {useI18n} from 'vue-i18n'
import {type AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import {type MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {type commandstate, type unitstate, unitType} from "@/engine/units/types.ts";
import type {MoveFrame, vec2} from "@/engine/types.ts";
import {getInaccuracyAbility} from "@/engine/resourcePack/abilities.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import type {DirectViewObjectState} from "@/engine/types/directViewObjects.ts";
import {processUnitCommands} from "@/engine/world/runTurnStep.ts";
import {
  isAdminOrSpectatorTeam,
  isAdminTeam,
  isPlanningStage,
  isRedOrBlueTeam,
  isTimeModifiersEnabled,
  isWarStage,
  isWeatherModifiersEnabled,
} from "@/game/roomGuards.ts";

const { t } = useI18n()

const displayWorldTime = ref<string>(window.ROOM_WORLD.time)
const timeOfDay = ref<TimeOfDay>(window.ROOM_WORLD.getTimeOfDay())
const weather = window.ROOM_WORLD.weather

const minutes = ref(1)
const seconds = ref(0)
const livePerMinute = ref(false)

const totalSeconds = ref(0)
const running = ref(false)
const isLiveRunning = ref(false)
const LIVE_TICK_MS = 1_000
let liveLoopToken = 0
let liveWaitTimeoutId: ReturnType<typeof window.setTimeout> | null = null

/* ===== helpers ===== */

const displayTurnTime = computed(() => {
  if (isLiveRunning.value) return 'LIVE'
  const m = Math.floor(totalSeconds.value / 60)
  const s = totalSeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

const isLiveDurationLocked = computed(() => running.value && isLiveRunning.value)

const showRemoteLiveBadge = computed(() => {
  return !isAdminTeam() && window.ROOM_WORLD.skipTimeLive.value
})

function onWheelNumber(
  e: WheelEvent,
  timeType: 'seconds' | 'minutes',
  min = -Infinity,
  max = Infinity
) {
  if (isLiveDurationLocked.value) return
  e.preventDefault()

  const delta = e.deltaY < 0 ? 1 : -1
  if (timeType === 'seconds') {
    seconds.value += delta
    seconds.value = Math.min(max, Math.max(min, seconds.value))
  } else if (timeType === 'minutes') {
    minutes.value += delta
    minutes.value = Math.min(max, Math.max(min, minutes.value))
  }
}

function pointInTeamGeneralVision(team: unitTeam, point: vec2): boolean {
  const generals = window.ROOM_WORLD.units.list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, window.ROOM_WORLD)
    if (pointInPolygon(point, visionPoly)) {
      return true
    }
  }

  return false
}

function getTeamGeneralVisionPolygons(team: unitTeam): vec2[][] {
  return window.ROOM_WORLD.units.list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)
    .map((general) => buildVisionPolygon(general, window.ROOM_WORLD))
}

function distancePointToSegment(point: vec2, segStart: vec2, segEnd: vec2): number {
  const vx = segEnd.x - segStart.x
  const vy = segEnd.y - segStart.y
  const wx = point.x - segStart.x
  const wy = point.y - segStart.y

  const segmentLengthSq = vx * vx + vy * vy
  if (segmentLengthSq <= 1e-9) {
    return Math.hypot(point.x - segStart.x, point.y - segStart.y)
  }

  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / segmentLengthSq))
  const closestX = segStart.x + vx * t
  const closestY = segStart.y + vy * t
  return Math.hypot(point.x - closestX, point.y - closestY)
}

function circleIntersectsPolygon(center: vec2, radius: number, polygon: vec2[]): boolean {
  if (polygon.length < 2) return false

  if (pointInPolygon(center, polygon)) {
    return true
  }

  for (let i = 0; i < polygon.length; i++) {
    const edgeStart = polygon[i]!
    const edgeEnd = polygon[(i + 1) % polygon.length]!
    if (distancePointToSegment(center, edgeStart, edgeEnd) <= radius) {
      return true
    }
  }

  return false
}

function inaccuracyAreaInTeamGeneralVision(team: unitTeam, center: vec2, radiusMeters: number): number | null {
  const radiusPixels = radiusMeters / window.ROOM_WORLD.map.metersPerPixel
  const generals = window.ROOM_WORLD.units.list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, window.ROOM_WORLD)
    if (circleIntersectsPolygon(center, radiusPixels, visionPoly)) {
      if (general.roomMapUserId > 0) {
        return general.roomMapUserId
      }
    }
  }

  return null
}

function lineSegmentIntersectionT(
  a1: vec2,
  a2: vec2,
  b1: vec2,
  b2: vec2
): number | null {
  const r = {x: a2.x - a1.x, y: a2.y - a1.y}
  const s = {x: b2.x - b1.x, y: b2.y - b1.y}
  const denominator = r.x * s.y - r.y * s.x
  if (Math.abs(denominator) < 1e-9) return null

  const qp = {x: b1.x - a1.x, y: b1.y - a1.y}
  const t = (qp.x * s.y - qp.y * s.x) / denominator
  const u = (qp.x * r.y - qp.y * r.x) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return t
}

function getFirstSegmentVisibilityEntry(from: vec2, to: vec2, polygons: vec2[][]): { point: vec2; t: number } | null {
  const isVisibleAtT = (t: number) => {
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    }
    return polygons.some((polygon) => pointInPolygon(point, polygon))
  }

  if (isVisibleAtT(0)) {
    return { point: { x: from.x, y: from.y }, t: 0 }
  }

  const rawTs: number[] = [0, 1]
  for (const polygon of polygons) {
    if (polygon.length < 2) continue
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i]!
      const p2 = polygon[(i + 1) % polygon.length]!
      const t = lineSegmentIntersectionT(from, to, p1, p2)
      if (t == null) continue
      rawTs.push(t)
    }
  }

  rawTs.sort((a, b) => a - b)
  const uniqueTs: number[] = []
  for (const t of rawTs) {
    if (uniqueTs.length === 0 || Math.abs(t - uniqueTs[uniqueTs.length - 1]!) > 1e-6) {
      uniqueTs.push(t)
    }
  }

  for (let i = 0; i < uniqueTs.length - 1; i++) {
    const t0 = uniqueTs[i]!
    const t1 = uniqueTs[i + 1]!
    const middleT = (t0 + t1) / 2
    if (!isVisibleAtT(middleT)) continue
    return {
      point: {
        x: from.x + (to.x - from.x) * t0,
        y: from.y + (to.y - from.y) * t0,
      },
      t: t0,
    }
  }

  if (isVisibleAtT(1)) {
    return { point: { x: to.x, y: to.y }, t: 1 }
  }

  return null
}

function clipFramesForDirectViewTeam(
  frames: MoveFrame[] | undefined,
  unitTeam: unitTeam,
  team: unitTeam
): MoveFrame[] | undefined {
  if (!frames || frames.length < 2) return frames
  if (unitTeam === team) return frames

  const start = frames[0]!.pos
  const end = frames[frames.length - 1]!.pos
  const startTime = frames[0]!.t
  const endTime = frames[frames.length - 1]!.t
  const duration = endTime - startTime
  const polygons = getTeamGeneralVisionPolygons(team)
  if (!polygons.length) return undefined

  const entry = getFirstSegmentVisibilityEntry(start, end, polygons)
  if (!entry) return undefined
  if (Math.hypot(end.x - entry.point.x, end.y - entry.point.y) < 0.01) return undefined

  const entryTime = duration > 0
    ? startTime + duration * entry.t
    : startTime

  return [
    {
      t: entryTime,
      pos: entry.point,
    },
    {
      t: endTime,
      pos: end,
    },
  ]
}

function getLineExitPointFromVisionPolygon(from: vec2, to: vec2, polygon: vec2[]): vec2 | null {
  if (polygon.length < 2) return null

  let bestT: number | null = null
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]!
    const p2 = polygon[(i + 1) % polygon.length]!
    const t = lineSegmentIntersectionT(from, to, p1, p2)
    if (t == null) continue
    if (bestT == null || t > bestT) {
      bestT = t
    }
  }

  if (bestT == null) return null
  return {
    x: from.x + (to.x - from.x) * bestT,
    y: from.y + (to.y - from.y) * bestT,
  }
}

function getAttackDirectViewTargetPoint(attackerPos: vec2, targetPos: vec2, team: unitTeam): vec2 | null {
  const generals = window.ROOM_WORLD.units.list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  let bestPoint: vec2 | null = null
  let bestDistance = -1
  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, window.ROOM_WORLD)
    const attackerVisible = pointInPolygon(attackerPos, visionPoly)
    if (!attackerVisible) continue

    const targetVisible = pointInPolygon(targetPos, visionPoly)
    const point = targetVisible
      ? targetPos
      : getLineExitPointFromVisionPolygon(attackerPos, targetPos, visionPoly)
    if (!point) continue

    const distance = Math.hypot(point.x - attackerPos.x, point.y - attackerPos.y)
    if (distance > bestDistance) {
      bestDistance = distance
      bestPoint = point
    }
  }

  return bestPoint
}

function mapAttackCommandForDirectView(command: commandstate, unitId: string, team: unitTeam): commandstate {
  if (command.type !== UnitCommandTypes.Attack) return command

  const unit = window.ROOM_WORLD.units.get(unitId)
  if (!unit) return command

  const attackState = command.state as AttackCommandState
  let targetPoint: vec2 | null = null
  let nearestTargetDist = Infinity
  for (const targetId of attackState.targets) {
    const target = window.ROOM_WORLD.units.get(targetId)
    if (!target || !target.alive || target.team === unit.team) continue
    const dist = Math.hypot(target.pos.x - unit.pos.x, target.pos.y - unit.pos.y)
    if (dist < nearestTargetDist) {
      nearestTargetDist = dist
      targetPoint = getAttackDirectViewTargetPoint(unit.pos, target.pos, team)
    }
  }
  if (!targetPoint && attackState.inaccuracyPoint) {
    targetPoint = getAttackDirectViewTargetPoint(unit.pos, attackState.inaccuracyPoint, team)
  }

  return {
    ...command,
    state: {
      ...attackState,
      inaccuracyPoint: unit.team === team ? attackState.inaccuracyPoint : null,
      targets: [],
      directViewTargetPoint: targetPoint,
    },
  }
}

function getDirectViewCommands(unitId: string, team: unitTeam): commandstate[] {
  const unit = window.ROOM_WORLD.units.get(unitId)
  if (!unit) return []
  if (unit.team !== team) return []

  const rawCommands = unit.getCommands().map((command) => command.getState() as commandstate)
  let firstMoveIncluded = false
  let moveChainHiddenByFog = false

  return rawCommands
    .filter((command) => {
      if (command.type === UnitCommandTypes.Attack) {
        return true
      }
      if (command.type === UnitCommandTypes.Move) {
        return true
      }
      if (!firstMoveIncluded) {
        firstMoveIncluded = true
        return true
      }

      if (moveChainHiddenByFog) {
        return false
      }

      const moveState = command.state as unknown as MoveCommandState
      const isVisible = pointInTeamGeneralVision(team, moveState.target)
      if (!isVisible) {
        moveChainHiddenByFog = true
        return false
      }

      return true
    })
    .map((command) => mapAttackCommandForDirectView(command, unitId, team))
}

function getDirectViewObjects(team: unitTeam): DirectViewObjectState[] {
  const objectsByPoint = new Map<string, DirectViewObjectState>()

  for (const unit of window.ROOM_WORLD.units.list()) {
    if (!unit.alive || unit.team === team) continue

    for (const command of unit.getCommands()) {
      if (command.type !== UnitCommandTypes.Attack) continue

      const attackState = command.getState().state as AttackCommandState
      if (!attackState.inaccuracyPoint) continue

      const activeAbilities = (attackState.abilities ?? [])
        .filter((ability) => unit.abilities.includes(ability))
      const inaccuracyAbility = getInaccuracyAbility(activeAbilities)
      if (!inaccuracyAbility) continue

      const radiusMeters =
        computeInaccuracyRadius(unit, attackState.inaccuracyPoint)
        * (attackState.radiusModifier ?? 1)
        * inaccuracyAbility.radiusMult
      const normalizedRadius = Math.max(0, radiusMeters)
      const seenRoomUserId = inaccuracyAreaInTeamGeneralVision(team, attackState.inaccuracyPoint, normalizedRadius)
      if (seenRoomUserId == null) continue

      const key = `${attackState.inaccuracyPoint.x}:${attackState.inaccuracyPoint.y}`
      const existing = objectsByPoint.get(key)
      if (existing) {
        existing.data.radiusMeters = Math.max(existing.data.radiusMeters, normalizedRadius)
        const existingSeenRoomUserIds = existing.seenRoomUserIds ?? []
        if (!existingSeenRoomUserIds.includes(seenRoomUserId)) {
          existing.seenRoomUserIds = [...existingSeenRoomUserIds, seenRoomUserId]
        }
        continue
      }

      objectsByPoint.set(key, {
        type: 'inaccuracy',
        team: unit.team,
        seenRoomUserIds: [seenRoomUserId],
        data: {
          point: attackState.inaccuracyPoint,
          radiusMeters: normalizedRadius,
        },
      })
    }
  }

  return Array.from(objectsByPoint.values())
}

function captureUnitPositionsById() {
  const map = new Map<string, vec2>()
  for (const unit of window.ROOM_WORLD.units.list()) {
    map.set(unit.id, { x: unit.pos.x, y: unit.pos.y })
  }
  return map
}

function buildTickMoveFrames(from: vec2, to: vec2, durationMs: number): MoveFrame[] | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.hypot(dx, dy) < 0.01) return null

  return [
    {
      t: 0,
      pos: { x: from.x, y: from.y },
    },
    {
      t: durationMs,
      pos: { x: to.x, y: to.y },
    },
  ]
}

function getTickAnimationDurationMs(stepSeconds: number) {
  return 50
}

function buildMoveFramesByUnitId(
  unitPositionsBeforeTick: Map<string, vec2>,
  durationMs: number
) {
  const framesByUnitId = new Map<string, MoveFrame[]>()
  if (durationMs <= 0) return framesByUnitId

  for (const unit of window.ROOM_WORLD.units.list()) {
    const startPos = unitPositionsBeforeTick.get(unit.id)
    if (!startPos) continue

    const frames = buildTickMoveFrames(startPos, unit.pos, durationMs)
    if (!frames) continue

    framesByUnitId.set(unit.id, frames)
  }

  return framesByUnitId
}

async function flushTickUnitsWithAnimation(
  unitPositionsBeforeTick: Map<string, vec2>,
  animationDurationMs: number
) {
  const dirtyUnits = window.ROOM_WORLD.units.getDirty()
  const removedUnits = window.ROOM_WORLD.units.getDirtyRemove()
  let hasAnimation = false

  for (const dirty of dirtyUnits) {
    const unit = window.ROOM_WORLD.units.get(dirty.unit.id)
    const startPos = unitPositionsBeforeTick.get(dirty.unit.id)
    const endPos = dirty.unit.pos
    const frames = unit && startPos
      ? buildTickMoveFrames(startPos, endPos, animationDurationMs)
      : null

    window.ROOM_WORLD.events.emit('api', {
      type: 'unit',
      data: dirty.unit,
      frames: frames ?? undefined,
    })

    if (!unit || !startPos || !frames) continue

    hasAnimation = true
    unit.pos = {
      x: startPos.x,
      y: startPos.y,
    }
    unit.applyRemoteFrames(frames)
  }

  if (removedUnits.length) {
    window.ROOM_WORLD.events.emit('api', {
      type: 'unit-remove',
      data: removedUnits,
    })
  }

  if (!hasAnimation) return

  window.ROOM_WORLD.events.emit('changed', { reason: 'animation' })
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, animationDurationMs + 10)
  })
}

/* ===== timer ===== */

const MAX_STEP_SECONDS = 60 // 1 тик = 1 минута

function emitTurnStatePackets(directViewFramesByUnitId?: Map<string, MoveFrame[]>) {
  // DirectView general
  if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.GENERAL_VISION_UPDATE]) {
    const directViewByTeam = window.ROOM_WORLD.units.getDirectViewByGenerals();
    for (const team of [Team.RED, Team.BLUE]) {
      window.ROOM_WORLD.events.emit('api', {type: 'direct_view', team: team, data: directViewByTeam.get(team as unitTeam)!.map(({id, isDirect}) => {
        const u = window.ROOM_WORLD.units.get(id)!
        let unitState: unitstate
        if (!isDirect) {
          // For chained (non-direct) visibility update only position data.
          unitState = {
            id: u.id,
            type: u.type,
            team: u.team,
            pos: u.pos,
            angle: u.angle,
            roomMapUserId: u.roomMapUserId,
            seenRoomUserIds: u.seenRoomUserIds,
            commands: getDirectViewCommands(u.id, team as unitTeam),
          }
        } else {
          unitState = {
            id: u.id,
            type: u.type,
            team: u.team,
            pos: u.pos,
            angle: u.angle,
            roomMapUserId: u.roomMapUserId,
            seenRoomUserIds: u.seenRoomUserIds,

            isRetreatState: u.isRetreat,

            hp: u.hp,
            ammo: u.ammo,

            envState: u.envState,
            formation: u.getFormation(),
            activeAbilityType: u.activeAbilityType,
            commands: getDirectViewCommands(u.id, team as unitTeam),
          }
        }

        const frames = clipFramesForDirectViewTeam(
          directViewFramesByUnitId?.get(u.id),
          u.team,
          team as unitTeam
        )
        return {
          unit: unitState,
          frames: frames && frames.length > 0 ? frames : undefined,
        }
      })})
      window.ROOM_WORLD.events.emit('api', {
        type: 'direct_view_objects',
        team,
        data: getDirectViewObjects(team as unitTeam),
      })
    }
  }

  if (isWeatherModifiersEnabled()) {
    window.ROOM_WORLD.events.emit('api', {type: 'weather', data: window.ROOM_WORLD.newWeather.value});
    window.ROOM_WORLD.weather.value = window.ROOM_WORLD.newWeather.value;
  }
}

function clearLiveWaitTimer() {
  if (liveWaitTimeoutId != null) {
    window.clearTimeout(liveWaitTimeoutId)
    liveWaitTimeoutId = null
  }
}

function stopLiveTurn() {
  running.value = false
  isLiveRunning.value = false
  liveLoopToken += 1
  clearLiveWaitTimer()
  window.ROOM_WORLD.skipTime(0)
}

async function runTurnStep(
  secondsToSkip: number,
  isLive: boolean,
  onStep?: (leftSeconds: number) => void,
  liveGameSecondsPerMinute?: number
) {
  if (secondsToSkip <= 0) return

  const turnStartUnitPositions = captureUnitPositionsById()
  window.ROOM_WORLD.units.withNewCommandsTmp.clear()
  window.ROOM_WORLD.socketLock = true

  try {
    let leftSeconds = secondsToSkip
    let runningSteps = 0

    while (leftSeconds > 0 && running.value) {
      const step = Math.min(MAX_STEP_SECONDS, leftSeconds)
      const unitPositionsBeforeTick = captureUnitPositionsById()
      const animationDurationMs = getTickAnimationDurationMs(step)

      processUnitCommands(window.ROOM_WORLD, step)
      await flushTickUnitsWithAnimation(unitPositionsBeforeTick, animationDurationMs)

      leftSeconds -= step
      runningSteps++
      onStep?.(leftSeconds)

      window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
      window.ROOM_WORLD.skipTime(step, false)
      displayWorldTime.value = window.ROOM_WORLD.time
      timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()

      await new Promise(requestAnimationFrame)
    }

    if (!isLive && runningSteps > 0) {
      window.ROOM_WORLD.events.emit('api', {
        type: 'skip_time',
        data: window.ROOM_WORLD.time,
      })
    } else if (isLive && runningSteps > 0) {
      window.ROOM_WORLD.events.emit('api', {
        type: 'skip_time',
        data: window.ROOM_WORLD.time,
        live: true,
        liveIntervalMs: LIVE_TICK_MS,
        liveGameSecondsPerMinute,
      })
    }

    for (const unitId of window.ROOM_WORLD.units.withNewCommandsTmp) {
      window.ROOM_WORLD.units.withNewCommands.add(unitId)
    }

    const directViewAnimationDurationMs = isLive ? LIVE_TICK_MS : getTickAnimationDurationMs(secondsToSkip)
    const directViewFramesByUnitId = buildMoveFramesByUnitId(turnStartUnitPositions, directViewAnimationDurationMs)
    emitTurnStatePackets(directViewFramesByUnitId)

    // Do not broadcast no-op skip_time: it drops live flag on remote clients.
    window.ROOM_WORLD.skipTime(0, false)
    window.ROOM_WORLD.socketLock = false
    window.ROOM_WORLD.events.emit('force_api', {}).then();

    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()
  } finally {
    window.ROOM_WORLD.units.withNewCommandsTmp.clear()
  }
}

async function finalizeTurn() {
  window.ROOM_WORLD.events.emit('changed', { reason: 'timer' });
}

async function startTurn() {
  if (running.value) return

  const initialSeconds = minutes.value * 60 + seconds.value
  if (initialSeconds <= 0) return

  const runToken = ++liveLoopToken
  running.value = true
  isLiveRunning.value = livePerMinute.value
  totalSeconds.value = livePerMinute.value ? 0 : initialSeconds

  try {
    if (livePerMinute.value) {
      let liveFractionalCarry = 0
      const liveTicksPerMinute = Math.max(1, 60_000 / LIVE_TICK_MS)
      while (running.value && runToken === liveLoopToken) {
        const tickStartMs = Date.now()
        const perMinuteSeconds = Math.max(0, minutes.value * 60 + seconds.value)
        liveFractionalCarry += perMinuteSeconds / liveTicksPerMinute
        const skipSeconds = Math.floor(liveFractionalCarry)
        if (skipSeconds > 0 && running.value && runToken === liveLoopToken) {
          liveFractionalCarry -= skipSeconds
          await runTurnStep(skipSeconds, true, undefined, perMinuteSeconds)
        }
        if (!running.value || runToken !== liveLoopToken) break

        const elapsedMs = Date.now() - tickStartMs
        const waitMs = Math.max(0, LIVE_TICK_MS - elapsedMs)
        if (waitMs > 0) {
          await new Promise<void>((resolve) => {
            liveWaitTimeoutId = window.setTimeout(() => {
              liveWaitTimeoutId = null
              resolve()
            }, waitMs)
          })
        }
      }
    } else {
      await runTurnStep(initialSeconds, false, (leftSeconds) => {
        totalSeconds.value = leftSeconds
      })
    }
  } finally {
    clearLiveWaitTimer()
    running.value = false
    isLiveRunning.value = false
    totalSeconds.value = 0
    await finalizeTurn()
  }
}

function onPlayClick() {
  if (running.value) {
    if (isLiveRunning.value) {
      stopLiveTurn()
    }
    return
  }
  startTurn()
}

const readyStats = computed(() => window.ROOM_WORLD.getPlayerReadyStats())
const currentPlayerReady = computed(() => {
  if (!isRedOrBlueTeam()) return false
  const playerId = Number(window.PLAYER?.id)
  if (!Number.isFinite(playerId) || playerId <= 0) return false
  const team = window.PLAYER.team
  return window.ROOM_WORLD.playerReadyStates.value.some(
    (state) => state.user_id === playerId && state.team === team && state.is_ready
  )
})

function setReady(isReady: boolean) {
  if (!isPlanningStage() || !isRedOrBlueTeam()) return
  const playerId = Number(window.PLAYER?.id)
  if (!Number.isFinite(playerId) || playerId <= 0) return

  window.ROOM_WORLD.events.emit('api', {
    type: 'room_user_ready',
    data: {
      is_ready: isReady,
    },
  })
  window.ROOM_WORLD.upsertPlayerReadyState({
    user_id: playerId,
    team: window.PLAYER.team,
    is_ready: isReady,
  })
  window.ROOM_WORLD.events.emit('changed', { reason: 'room_user_ready' })
}

// LIFE CYCLE


// force refresh on changed
const refreshKey = ref(0)
function sync(data: {reason: string}) {
  debugPerformance('TurnTimer.sync', () => {
    if (['camera', 'drag', 'remoteMoveFrame'].includes(data.reason)) return;
    refreshKey.value++
    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()

    if (data.reason === 'skip_time_success' && !running.value) {
      running.value = false
      isLiveRunning.value = false
    }
  })
}

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
  sync({ reason: "init" })
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})
</script>

<template>
  <div class="turn-timer" :key="refreshKey">
    <div class="world-time">
      {{ displayWorldTime }}
      <span v-if="showRemoteLiveBadge" class="live-badge">LIVE</span>
    </div>

    <div class="turn-row">
      <div v-if="isPlanningStage() && isRedOrBlueTeam()" class="planning-ready-controls">
        <button
          class="ready-btn"
          :class="{ active: currentPlayerReady }"
          @pointerdown="setReady(!currentPlayerReady)"
        >
          {{ currentPlayerReady ? t('turn_timer.ready_disable') : t('turn_timer.ready_off') }}
        </button>
      </div>

      <div v-if="isPlanningStage() && isAdminOrSpectatorTeam()" class="planning-ready-stats">
        {{ t('turn_timer.ready_count', readyStats) }}
      </div>

      <div v-if="isAdminTeam() && isWarStage()" class="admin-controls">
        <div class="turn-time">
          ⏱ {{ displayTurnTime }}
        </div>

        <label class="live-toggle">
          <input type="checkbox" v-model="livePerMinute" :disabled="running" />
          LIVE per minute
        </label>

        <div class="admin-controls-row">
          <input
            type="number"
            min="0"
            v-model.number="minutes"
            :disabled="isLiveDurationLocked"
            @wheel="e => onWheelNumber(e, 'minutes', 0)"
          />
          <span>:</span>
          <input
            type="number"
            min="0"
            max="59"
            v-model.number="seconds"
            :disabled="isLiveDurationLocked"
            @wheel="e => onWheelNumber(e, 'seconds', 0)"
          />

          <button @pointerdown="onPlayClick" :disabled="running && !isLiveRunning">
            {{ running && isLiveRunning ? '⏸' : '▶' }}
          </button>
        </div>
      </div>
    </div>

    <div class="world-time-state">
      <span class="label" v-if="isTimeModifiersEnabled()">
        {{ t(`time.${timeOfDay}`) }}
      </span>
      <span class="separator" v-if="isTimeModifiersEnabled() && isWeatherModifiersEnabled()">
        •
      </span>
      <span class="label" v-if="isWeatherModifiersEnabled()">
        {{ t(`weather.${weather}`) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.turn-timer {
  width: 220px;
  text-align: center;

  background: #020617cc;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 6px 12px;

  color: white;
  font-size: 13px;

  display: flex;
  flex-direction: column;
  gap: 4px;

  pointer-events: auto;
}


.world-time {
  text-align: center;
  font-size: 20px;
  opacity: 0.85;
}

.live-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #dbeafe;
  background: #0f172a;
  border: 1px solid #38bdf8;
  vertical-align: middle;
}

.turn-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.planning-ready-controls {
  display: flex;
  justify-content: center;
}

.ready-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: white;
  cursor: pointer;
}

.ready-btn.active {
  background: #0f5132;
  border-color: #198754;
}

.planning-ready-stats {
  font-size: 13px;
  opacity: 0.95;
}

.turn-time {
  font-size: 16px;
  font-weight: 600;
  min-width: 56px;
}

.admin-controls {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  gap: 4px;
}

.live-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  font-size: 12px;
}

.live-toggle input {
  width: auto;
}

.admin-controls-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.admin-controls-row input {
  width: 50px;
  padding: 2px 4px;
  text-align: center;

  background: #020617;
  border: 1px solid #334155;
  color: white;
  border-radius: 6px;
}

.admin-controls-row button {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.admin-controls-row button:disabled {
  background: #020617;
  border-color: #334155;
  color: #64748b;

  cursor: not-allowed;
  opacity: 0.6;
}

button.disabled {
  background: #020617;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
  opacity: 0.6;
}

.world-time-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  font-size: 11px;
  opacity: 0.75;

  white-space: nowrap;
}

.world-time-state .icon {
  font-size: 14px;
}

.world-time-state .label {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-time-state .separator {
  opacity: 0.4;
  margin: 0 2px;
}

</style>

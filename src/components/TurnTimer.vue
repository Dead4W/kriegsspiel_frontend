<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {Team} from '@/enums/teamKeys'
import {RoomGameStage} from "@/enums/roomStage.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import type {unitTeam} from "@/engine";
import {buildVisionPolygon, pointInPolygon} from "@/engine/2d/render";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys";
import type {TimeOfDay} from "@/engine/resourcePack/timeOfDay.ts";
import {useI18n} from 'vue-i18n'
import {AttackCommand, type AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import {type MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {type commandstate, unitType} from "@/engine/units/types.ts";
import type {MoveFrame, vec2} from "@/engine/types.ts";
import {getInaccuracyAbility} from "@/engine/resourcePack/abilities.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import type {DirectViewObjectState} from "@/engine/types/directViewObjects.ts";
import { applyAutoEnvironment } from "@/engine/units/autoEnvironment.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";

const { t } = useI18n()

const displayWorldTime = ref<string>(window.ROOM_WORLD.time)
const timeOfDay = ref<TimeOfDay>(window.ROOM_WORLD.getTimeOfDay())
const weather = window.ROOM_WORLD.weather

const minutes = ref(1)
const seconds = ref(0)

const totalSeconds = ref(0)
const running = ref(false)

/* ===== helpers ===== */

const displayTurnTime = computed(() => {
  const m = Math.floor(totalSeconds.value / 60)
  const s = totalSeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

function isAdmin() {
  return window.PLAYER?.team === Team.ADMIN
}

function isWar() {
  return window.ROOM_WORLD.stage === RoomGameStage.WAR;
}

function isPlanning() {
  return window.ROOM_WORLD.stage === RoomGameStage.PLANNING;
}

function isPlayerTeam() {
  return window.PLAYER?.team === Team.RED || window.PLAYER?.team === Team.BLUE;
}

function isAdminOrSpectator() {
  return window.PLAYER?.team === Team.ADMIN || window.PLAYER?.team === Team.SPECTATOR;
}

function isEnabledTimeModifiers() {
  return !!window.ROOM_SETTINGS[ROOM_SETTING_KEYS.TIME_MODIFIERS]
}

function isEnabledWeatherModifiers() {
  return !!window.ROOM_SETTINGS[ROOM_SETTING_KEYS.WEATHER_MODIFIERS]
}

function onWheelNumber(
  e: WheelEvent,
  timeType: 'seconds' | 'minutes',
  min = -Infinity,
  max = Infinity
) {
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

function setUnitAngleFromMoveVector(unit: { angle: number }, from: vec2, to: vec2) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return

  const tau = Math.PI * 2
  // Unit textures are oriented "forward = up", so shift +PI/2 from +X.
  const angle = Math.atan2(dy, dx) + Math.PI / 2
  unit.angle = ((angle % tau) + tau) % tau
}

type UnitMoveSortKey = {
  uniqueId: string
  orderIndex: number
}

function getFirstMoveSortKey(unit: ReturnType<typeof window.ROOM_WORLD.units.list>[number]): UnitMoveSortKey | null {
  const firstMoveCommand = unit
    .getCommands()
    .find((cmd) => cmd.type === UnitCommandTypes.Move && !cmd.isFinished(unit))

  if (!firstMoveCommand) return null

  const moveState = firstMoveCommand.getState().state as MoveCommandState
  return {
    uniqueId: moveState.uniqueId ?? '',
    orderIndex: Number.isFinite(moveState.orderIndex) ? moveState.orderIndex : Number.MAX_SAFE_INTEGER,
  }
}

function sortUnitsForTurnStep(units: ReturnType<typeof window.ROOM_WORLD.units.list>) {
  units.sort((a, b) => {
    const aMove = getFirstMoveSortKey(a)
    const bMove = getFirstMoveSortKey(b)

    if (aMove && !bMove) return -1
    if (!aMove && bMove) return 1

    if (aMove && bMove) {
      if (aMove.uniqueId !== bMove.uniqueId) {
        return aMove.uniqueId.localeCompare(bMove.uniqueId)
      }
      if (aMove.orderIndex !== bMove.orderIndex) {
        return aMove.orderIndex - bMove.orderIndex
      }
    }

    return a.id.localeCompare(b.id)
  })
}

/* ===== Commands ==== */

function processUnitCommands(dt: number) {
  const units = window.ROOM_WORLD.units.list()
  sortUnitsForTurnStep(units)
  for (const unit of units) {
    if (!unit.alive) continue

    const commands = unit.getCommands()
    const firstActiveCommand = commands.find((cmd) => !cmd.isFinished(unit))
    const isMovingNow = firstActiveCommand?.type === UnitCommandTypes.Move
    applyAutoEnvironment(unit, isMovingNow ? 'moving' : 'standing')
  }
  syncFormationMoveSpeedByOrder(units)

  for (const unit of units) {
    if (!unit.alive) continue

    let commands = unit.getCommands()
    if (unit.autoAttack) {
      const directEnemyVision = window.ROOM_WORLD.units.getDirectView(unit)
        .filter(u => u.team !== unit.team)
      const hasInaccuracyAttack = commands.filter(c => c.type === UnitCommandTypes.Attack && (c.getState().state as AttackCommandState).inaccuracyPoint).length > 0

      if (!hasInaccuracyAttack) {
        commands = commands.filter(c => c.type !== UnitCommandTypes.Attack)
        const attackCommand = new AttackCommand({
          targets: directEnemyVision.map(u => u.id),
          damageModifier: 1,
          abilities: [],
          inaccuracyPoint: null
        })
        commands.push(attackCommand)
      }
    }

    if (commands.length === 0) continue;

    let left_dt = dt;

    const goodCommands = [];
    const postGoodCommands = [];
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!
      const moveStartPos =
        cmd.type === UnitCommandTypes.Move
          ? { x: unit.pos.x, y: unit.pos.y }
          : null

      let isRepeat = false;
      if (cmd.type === UnitCommandTypes.Move) {
        const cmdMoveState = cmd.getState().state as MoveCommandState
        isRepeat = cmdMoveState.isPatrol ?? false;
      }

      if (cmd.isFinished(unit)) {
        if (isRepeat) {
          postGoodCommands.push(cmd);
        }
        continue;
      }

      if ([UnitCommandTypes.Attack, UnitCommandTypes.Retreat, UnitCommandTypes.Delivery].includes(cmd.type)) {
        cmd.start(unit)
        cmd.update(unit, dt)
        if (cmd.type === UnitCommandTypes.Delivery) {
          // Delivery command can rebuild unit command queue (append A* move segments).
          // Keep processing the actual queue, otherwise goodCommands will overwrite it.
          commands = unit.getCommands()
        }
      } else {
        if (left_dt > 0) {
          const estimate = cmd.estimate(unit);
          cmd.start(unit)
          if (estimate > left_dt) {
            cmd.update(unit, left_dt)
            left_dt = 0
          } else {
            cmd.update(unit, estimate)
            left_dt -= estimate;
          }
        } else {
          goodCommands.push(cmd)
          continue
        }
      }

      const isFinishedAfterUpdate = cmd.isFinished(unit)
      if (isFinishedAfterUpdate && cmd.type === UnitCommandTypes.Move && moveStartPos) {
        const moveState = cmd.getState().state as MoveCommandState
        setUnitAngleFromMoveVector(unit, moveStartPos, moveState.target)
      }

      if (!isFinishedAfterUpdate) {
        goodCommands.push(cmd);
      } else if (isRepeat) {
        postGoodCommands.push(cmd);
      }
    }

    for (let cmd of postGoodCommands) {
      goodCommands.push(cmd)
    }

    // если список изменился — синхронизируем
    unit.setCommands(goodCommands)

    const nextActiveCommand = goodCommands.find((cmd) => !cmd.isFinished(unit))
    const isMovingAfterStep = nextActiveCommand?.type === UnitCommandTypes.Move
    applyAutoEnvironment(unit, isMovingAfterStep ? 'moving' : 'standing')

    unit.setDirty()
  }

  syncFormationMoveSpeedByOrder(units)
}

function syncFormationMoveSpeedByOrder(units: ReturnType<typeof window.ROOM_WORLD.units.list>) {
  type GroupUnit = {
    unit: ReturnType<typeof window.ROOM_WORLD.units.list>[number]
    moveState: MoveCommandState
  }

  const moveGroups = new Map<string, GroupUnit[]>()
  const getWaitingColumnSpeedMultiplier = (distancePx: number): number => {
    if (distancePx <= BaseUnit.COLLISION_RANGE) return 1
    const metersPerPixel = Math.max(0.0001, Number(window.ROOM_WORLD.map.metersPerPixel) || 1)
    const distanceMeters = distancePx * metersPerPixel
    const collisionRangeMeters = BaseUnit.COLLISION_RANGE * metersPerPixel
    const multiplier = 1 - (distanceMeters - collisionRangeMeters) * 0.001
    return Math.max(0.1, Math.min(1, multiplier))
  }

  for (const unit of units) {
    if (!unit.alive) continue
    unit.setFormationMoveMinSpeed(null)
    unit.setColumnLagSpeedMultiplier(1)

    const firstActiveCommand = unit.getCommands().find((cmd) => !cmd.isFinished(unit))
    if (!firstActiveCommand || firstActiveCommand.type !== UnitCommandTypes.Move) continue

    const moveState = firstActiveCommand.getState().state as MoveCommandState
    if (!moveState.uniqueId) continue

    const groupUnits = moveGroups.get(moveState.uniqueId)
    if (groupUnits) {
      groupUnits.push({
        unit,
        moveState,
      })
    } else {
      moveGroups.set(moveState.uniqueId, [{
        unit,
        moveState,
      }])
    }
  }

  for (const groupUnits of moveGroups.values()) {
    if (groupUnits.length < 2) continue

    const minSpeed = Math.min(...groupUnits.map(({ unit }) => unit.speed))
    const unitByOrderIndex = new Map<number, GroupUnit>()

    for (const groupUnit of groupUnits) {
      const orderIndex = Number.isFinite(groupUnit.moveState.orderIndex)
        ? groupUnit.moveState.orderIndex
        : Number.MAX_SAFE_INTEGER
      if (!unitByOrderIndex.has(orderIndex)) {
        unitByOrderIndex.set(orderIndex, groupUnit)
      }
    }

    for (const groupUnit of groupUnits) {
      let laggingMultiplier = 1
      const currentOrderIndex = Number.isFinite(groupUnit.moveState.orderIndex)
        ? groupUnit.moveState.orderIndex
        : Number.MAX_SAFE_INTEGER

      const prevUnit = unitByOrderIndex.get(currentOrderIndex - 1)
      if (prevUnit) {
        const distanceToPrevPx = Math.hypot(
          prevUnit.unit.pos.x - groupUnit.unit.pos.x,
          prevUnit.unit.pos.y - groupUnit.unit.pos.y
        )
        if (distanceToPrevPx > BaseUnit.COLLISION_RANGE) {
          // Lagging behind previous unit in column: speed up to catch up.
          laggingMultiplier = 1.1
        }
      }

      const nextUnit = unitByOrderIndex.get(currentOrderIndex + 1)
      if (nextUnit && laggingMultiplier === 1) {
        const distancePx = Math.hypot(
          nextUnit.unit.pos.x - groupUnit.unit.pos.x,
          nextUnit.unit.pos.y - groupUnit.unit.pos.y
        )
        laggingMultiplier = getWaitingColumnSpeedMultiplier(distancePx)
      }

      groupUnit.unit.setFormationMoveMinSpeed(minSpeed)
      groupUnit.unit.setColumnLagSpeedMultiplier(laggingMultiplier)
    }
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

  const rawCommands = unit.getCommands().map((command) => command.getState() as commandstate)
  const isEnemyUnit = unit.team !== team
  let firstMoveIncluded = false

  return rawCommands
    .filter((command) => {
      if (command.type === UnitCommandTypes.Attack) {
        return true
      }
      if (command.type !== UnitCommandTypes.Move) {
        return false
      }
      if (isEnemyUnit) {
        return false
      }

      if (!firstMoveIncluded) {
        firstMoveIncluded = true
        return true
      }

      return pointInTeamGeneralVision(team, command.state.target)
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
  const fullTickSeconds = 60
  const minDuration = 180
  const fullTickDuration = 100
  const ratio = Math.max(0, Math.min(1, stepSeconds / fullTickSeconds))
  return Math.max(minDuration, Math.round(fullTickDuration * ratio))
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
    window.setTimeout(resolve, animationDurationMs + 40)
  })
}

/* ===== timer ===== */

async function startTurn() {
  const value = minutes.value * 60 + seconds.value
  if (value <= 0 || running.value) return

  totalSeconds.value = value
  running.value = true

  const MAX_STEP = 60 // 1 тик = 1 минута

  window.ROOM_WORLD.units.withNewCommandsTmp.clear()
  window.ROOM_WORLD.socketLock = true
  let runningSteps = 0

  while (totalSeconds.value > 0 && running.value) {
    if (!running.value) break
    const step = Math.min(MAX_STEP, totalSeconds.value)
    const unitPositionsBeforeTick = captureUnitPositionsById()
    const animationDurationMs = getTickAnimationDurationMs(step)

    processUnitCommands(step)
    await flushTickUnitsWithAnimation(unitPositionsBeforeTick, animationDurationMs)

    totalSeconds.value -= step

    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })

    runningSteps++

    window.ROOM_WORLD.skipTime(step, false)
    window.ROOM_WORLD.events.emit('api', { type: 'skip_time', data: window.ROOM_WORLD.time })
    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()
    window.ROOM_WORLD.socketLock = false
    await window.ROOM_WORLD.events.emit('force_api', {})
    window.ROOM_WORLD.socketLock = true

    if (runningSteps % 10 === 0) {
      // отдаём управление браузеру
      await new Promise(requestAnimationFrame)
    }
  }

  window.ROOM_WORLD.events.emit('changed', { reason: 'timer' });

  // DirectView general
  if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.GENERAL_VISION_UPDATE]) {
    const directViewByTeam = window.ROOM_WORLD.units.getDirectViewByGenerals();
    for (const team of [Team.RED, Team.BLUE]) {
      window.ROOM_WORLD.events.emit('api', {type: 'direct_view', team: team, data: directViewByTeam.get(team as unitTeam)!.map(({id, isDirect}) => {
        const u = window.ROOM_WORLD.units.get(id)!
        if (!isDirect) {
          // For chained (non-direct) visibility update only position data.
          return {
            id: u.id,
            type: u.type,
            team: u.team,
            pos: u.pos,
            angle: u.angle,
            seenRoomUserIds: u.seenRoomUserIds,
          }
        }
        return {
          id: u.id,
          type: u.type,
          team: u.team,
          pos: u.pos,
          angle: u.angle,
          seenRoomUserIds: u.seenRoomUserIds,

          isRetreatState: u.isRetreat,

          hp: u.hp,
          ammo: u.ammo,

          envState: u.envState,
          formation: u.getFormation(),
          activeAbilityType: u.activeAbilityType,
          commands: getDirectViewCommands(u.id, team as unitTeam),
        }
      })})
      window.ROOM_WORLD.events.emit('api', {
        type: 'direct_view_objects',
        team,
        data: getDirectViewObjects(team as unitTeam),
      })
    }
  }

  if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.WEATHER_MODIFIERS]) {
    window.ROOM_WORLD.events.emit('api', {type: 'weather', data: window.ROOM_WORLD.newWeather.value});
    window.ROOM_WORLD.weather.value = window.ROOM_WORLD.newWeather.value;
  }

  // units with new commands
  for (const unitId of window.ROOM_WORLD.units.withNewCommandsTmp) {
    window.ROOM_WORLD.units.withNewCommands.add(unitId)
  }

  // ВСЕГДА В КОНЦЕ
  window.ROOM_WORLD.skipTime(0)
  window.ROOM_WORLD.socketLock = false
  window.ROOM_WORLD.events.emit('force_api', {}).then();

  displayWorldTime.value = window.ROOM_WORLD.time
  timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()
}

function stopTurn() {
  running.value = false
}

const readyStats = computed(() => window.ROOM_WORLD.getPlayerReadyStats())
const currentPlayerReady = computed(() => {
  if (!isPlayerTeam()) return false
  const playerId = Number(window.PLAYER?.id)
  if (!Number.isFinite(playerId) || playerId <= 0) return false
  const team = window.PLAYER.team
  return window.ROOM_WORLD.playerReadyStates.value.some(
    (state) => state.user_id === playerId && state.team === team && state.is_ready
  )
})

function setReady(isReady: boolean) {
  if (!isPlanning() || !isPlayerTeam()) return
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
    if (['camera', 'drag'].includes(data.reason)) return;
    refreshKey.value++
    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()

    if (data.reason === 'skip_time_success') {
      running.value = false
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
    </div>

    <div class="turn-row">
      <div v-if="isPlanning() && isPlayerTeam()" class="planning-ready-controls">
        <button
          class="ready-btn"
          :class="{ active: currentPlayerReady }"
          @pointerdown="setReady(!currentPlayerReady)"
        >
          {{ currentPlayerReady ? t('turn_timer.ready_disable') : t('turn_timer.ready_off') }}
        </button>
      </div>

      <div v-if="isPlanning() && isAdminOrSpectator()" class="planning-ready-stats">
        {{ t('turn_timer.ready_count', readyStats) }}
      </div>

      <div v-if="isAdmin() && isWar()" class="admin-controls">
        <div class="turn-time">
          ⏱ {{ displayTurnTime }}
        </div>

        <input
          type="number"
          min="0"
          v-model.number="minutes"
          @wheel="e => onWheelNumber(e, 'minutes', 0)"
        />
        <span>:</span>
        <input
          type="number"
          min="0"
          max="59"
          v-model.number="seconds"
          @wheel="e => onWheelNumber(e, 'seconds', 0)"
        />

        <button @pointerdown="startTurn" :class="{disabled: running}">
          ▶
        </button>
      </div>
    </div>

    <div class="world-time-state">
      <span class="label" v-if="isEnabledTimeModifiers()">
        {{ t(`time.${timeOfDay}`) }}
      </span>
      <span class="separator" v-if="isEnabledTimeModifiers() && isEnabledWeatherModifiers()">
        •
      </span>
      <span class="label" v-if="isEnabledWeatherModifiers()">
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
  align-items: center;
  gap: 4px;
}

.admin-controls input {
  width: 50px;
  padding: 2px 4px;
  text-align: center;

  background: #020617;
  border: 1px solid #334155;
  color: white;
  border-radius: 6px;
}

.admin-controls button {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.admin-controls button:disabled {
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

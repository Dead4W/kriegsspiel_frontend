import { buildVisionPolygon, pointInPolygon } from '@/engine/2d/render'
import { getInaccuracyAbility } from '@/engine/resourcePack/abilities.ts'
import type { DirectViewInaccuracyObject, DirectViewObjectState } from '@/engine/types/directViewObjects.ts'
import type { MoveFrame, vec2 } from '@/engine/types.ts'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes.ts'
import type { AttackCommandState } from '@/engine/units/commands/attackCommand.ts'
import type { MoveCommandState } from '@/engine/units/commands/moveCommand.ts'
import { computeInaccuracyRadius } from '@/engine/units/modifiers/UnitInaccuracyModifier.ts'
import { type commandstate, type unitstate, type unitTeam, unitType } from '@/engine/units/types.ts'
import type { world } from '@/engine/world/world.ts'
import { Team } from '@/enums/teamKeys'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys'
import { isWeatherModifiersEnabled } from '@/game/roomGuards.ts'
import type { OutMessage } from '@/api/socket.ts'

/** Enemy fire within this radius is shown as one attack line. */
export const ENEMY_ATTACK_LINE_GROUP_RADIUS_METERS = 500

function pointInTeamGeneralVision(worldInstance: world, team: unitTeam, point: vec2): boolean {
  const generals = worldInstance.units
    .list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, worldInstance)
    if (pointInPolygon(point, visionPoly)) {
      return true
    }
  }

  return false
}

function getTeamGeneralVisionPolygons(worldInstance: world, team: unitTeam): vec2[][] {
  return worldInstance.units
    .list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)
    .map((general) => buildVisionPolygon(general, worldInstance))
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
  if (pointInPolygon(center, polygon)) return true

  for (let i = 0; i < polygon.length; i++) {
    const edgeStart = polygon[i]!
    const edgeEnd = polygon[(i + 1) % polygon.length]!
    if (distancePointToSegment(center, edgeStart, edgeEnd) <= radius) {
      return true
    }
  }

  return false
}

function inaccuracyAreaInTeamGeneralVision(
  worldInstance: world,
  team: unitTeam,
  center: vec2,
  radiusMeters: number,
): number[] | null {
  const radiusPixels = radiusMeters / worldInstance.map.metersPerPixel
  const generals = worldInstance.units
    .list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  let isVisible = false
  const seenRoomUserIds = new Set<number>()
  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, worldInstance)
    if (!circleIntersectsPolygon(center, radiusPixels, visionPoly)) continue

    isVisible = true
    if (general.roomMapUserId > 0) {
      seenRoomUserIds.add(general.roomMapUserId)
    }
  }

  // null = not visible. Empty array = visible, no per-player restriction.
  if (!isVisible) return null
  return Array.from(seenRoomUserIds).sort((a, b) => a - b)
}

function lineSegmentIntersectionT(a1: vec2, a2: vec2, b1: vec2, b2: vec2): number | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y }
  const s = { x: b2.x - b1.x, y: b2.y - b1.y }
  const denominator = r.x * s.y - r.y * s.x
  if (Math.abs(denominator) < 1e-9) return null

  const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
  const t = (qp.x * s.y - qp.y * s.x) / denominator
  const u = (qp.x * r.y - qp.y * r.x) / denominator
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return t
}

function pointAlongSegment(from: vec2, to: vec2, t: number): vec2 {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  }
}

function collectSegmentPolygonIntersectionTs(from: vec2, to: vec2, polygons: vec2[][]): number[] {
  const rawTs: number[] = [0, 1]
  for (const polygon of polygons) {
    if (polygon.length < 2) continue
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i]!
      const p2 = polygon[(i + 1) % polygon.length]!
      const t = lineSegmentIntersectionT(from, to, p1, p2)
      if (t != null) rawTs.push(t)
    }
  }

  rawTs.sort((a, b) => a - b)
  const uniqueTs: number[] = []
  for (const t of rawTs) {
    if (uniqueTs.length === 0 || Math.abs(t - uniqueTs[uniqueTs.length - 1]!) > 1e-6) {
      uniqueTs.push(t)
    }
  }
  return uniqueTs
}

function isPointVisibleInPolygons(point: vec2, polygons: vec2[][]): boolean {
  return polygons.some((polygon) => pointInPolygon(point, polygon))
}

export function clipSegmentToVisionPolygons(
  from: vec2,
  to: vec2,
  polygons: vec2[][],
): { from: vec2; to: vec2; t0: number; t1: number } | null {
  if (!polygons.length) return null

  const isVisibleAtT = (t: number) => isPointVisibleInPolygons(pointAlongSegment(from, to, t), polygons)
  const uniqueTs = collectSegmentPolygonIntersectionTs(from, to, polygons)
  if (uniqueTs.length < 2) {
    return isVisibleAtT(0) ? { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, t0: 0, t1: 1 } : null
  }

  let bestT0: number | null = null
  let bestT1: number | null = null
  let runT0: number | null = null
  let runT1: number | null = null

  const commitRun = () => {
    if (runT0 == null || runT1 == null) return
    if (bestT0 == null || bestT1 == null || runT1 - runT0 > bestT1 - bestT0) {
      bestT0 = runT0
      bestT1 = runT1
    }
    runT0 = null
    runT1 = null
  }

  for (let i = 0; i < uniqueTs.length - 1; i++) {
    const t0 = uniqueTs[i]!
    const t1 = uniqueTs[i + 1]!
    if (!isVisibleAtT((t0 + t1) / 2)) {
      commitRun()
      continue
    }
    if (runT0 == null) runT0 = t0
    runT1 = t1
  }
  commitRun()

  if (bestT0 == null || bestT1 == null) {
    if (isVisibleAtT(0) && isVisibleAtT(1)) {
      return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, t0: 0, t1: 1 }
    }
    return null
  }

  return {
    from: pointAlongSegment(from, to, bestT0),
    to: pointAlongSegment(from, to, bestT1),
    t0: bestT0,
    t1: bestT1,
  }
}

function getFirstSegmentVisibilityEntry(
  from: vec2,
  to: vec2,
  polygons: vec2[][],
): { point: vec2; t: number } | null {
  const isVisibleAtT = (t: number) => isPointVisibleInPolygons(pointAlongSegment(from, to, t), polygons)

  if (isVisibleAtT(0)) {
    return { point: { x: from.x, y: from.y }, t: 0 }
  }

  const uniqueTs = collectSegmentPolygonIntersectionTs(from, to, polygons)
  for (let i = 0; i < uniqueTs.length - 1; i++) {
    const t0 = uniqueTs[i]!
    const t1 = uniqueTs[i + 1]!
    if (!isVisibleAtT((t0 + t1) / 2)) continue
    return { point: pointAlongSegment(from, to, t0), t: t0 }
  }

  if (isVisibleAtT(1)) {
    return { point: { x: to.x, y: to.y }, t: 1 }
  }

  return null
}

function clipFramesForDirectViewTeam(
  worldInstance: world,
  frames: MoveFrame[] | undefined,
  unitTeam: unitTeam,
  team: unitTeam,
): MoveFrame[] | undefined {
  if (!frames || frames.length < 2) return frames
  if (unitTeam === team) return frames

  const start = frames[0]!.pos
  const end = frames[frames.length - 1]!.pos
  const startTime = frames[0]!.t
  const endTime = frames[frames.length - 1]!.t
  const duration = endTime - startTime
  const polygons = getTeamGeneralVisionPolygons(worldInstance, team)
  if (!polygons.length) return undefined

  const entry = getFirstSegmentVisibilityEntry(start, end, polygons)
  if (!entry) return undefined
  if (Math.hypot(end.x - entry.point.x, end.y - entry.point.y) < 0.01) return undefined

  const entryTime = duration > 0 ? startTime + duration * entry.t : startTime

  return [
    { t: entryTime, pos: entry.point },
    { t: endTime, pos: end },
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
    if (bestT == null || t > bestT) bestT = t
  }

  if (bestT == null) return null
  return {
    x: from.x + (to.x - from.x) * bestT,
    y: from.y + (to.y - from.y) * bestT,
  }
}

function getAttackDirectViewTargetPoint(
  worldInstance: world,
  attackerPos: vec2,
  targetPos: vec2,
  team: unitTeam,
): vec2 | null {
  const generals = worldInstance.units
    .list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  let bestPoint: vec2 | null = null
  let bestDistance = -1
  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, worldInstance)
    if (!pointInPolygon(attackerPos, visionPoly)) continue

    const point = pointInPolygon(targetPos, visionPoly)
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

function mapAttackCommandForDirectView(
  worldInstance: world,
  command: commandstate,
  unitId: string,
  team: unitTeam,
): commandstate {
  if (command.type !== UnitCommandTypes.Attack) return command

  const unit = worldInstance.units.get(unitId)
  if (!unit) return command

  const attackState = command.state as AttackCommandState
  let targetPoint: vec2 | null = null
  let nearestTargetDist = Infinity
  for (const targetId of attackState.targets) {
    const target = worldInstance.units.get(targetId)
    if (!target || !target.alive || target.team === unit.team) continue
    const dist = Math.hypot(target.pos.x - unit.pos.x, target.pos.y - unit.pos.y)
    if (dist < nearestTargetDist) {
      nearestTargetDist = dist
      targetPoint = getAttackDirectViewTargetPoint(worldInstance, unit.pos, target.pos, team)
    }
  }
  if (!targetPoint && attackState.inaccuracyPoint) {
    targetPoint = getAttackDirectViewTargetPoint(
      worldInstance,
      unit.pos,
      attackState.inaccuracyPoint,
      team,
    )
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

function segmentIntersectsPolygon(from: vec2, to: vec2, polygon: vec2[]): boolean {
  if (polygon.length < 2) return false
  if (pointInPolygon(from, polygon) || pointInPolygon(to, polygon)) return true

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]!
    const p2 = polygon[(i + 1) % polygon.length]!
    if (lineSegmentIntersectionT(from, to, p1, p2) != null) return true
  }

  return false
}

function attackLineSeenRoomUserIds(
  worldInstance: world,
  team: unitTeam,
  from: vec2,
  to: vec2,
): number[] | null {
  const generals = worldInstance.units
    .list()
    .filter((unit) => unit.team === team && unit.type === unitType.GENERAL && unit.alive)

  let isVisible = false
  const seenRoomUserIds = new Set<number>()
  for (const general of generals) {
    const visionPoly = buildVisionPolygon(general, worldInstance)
    if (!segmentIntersectsPolygon(from, to, visionPoly)) continue

    isVisible = true
    if (general.roomMapUserId > 0) {
      seenRoomUserIds.add(general.roomMapUserId)
    }
  }

  if (!isVisible) return null
  return Array.from(seenRoomUserIds).sort((a, b) => a - b)
}

function averagePoints(points: vec2[]): vec2 {
  const count = Math.max(1, points.length)
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / count, y: y / count }
}

export function clusterIndicesByDistance(points: vec2[], radius: number): number[][] {
  const parent = points.map((_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]!]!
      current = parent[current]!
    }
    return current
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  const radiusSq = radius * radius
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j]!
      const dx = a.x - b.x
      const dy = a.y - b.y
      if (dx * dx + dy * dy <= radiusSq) union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < points.length; i++) {
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(i)
    else groups.set(root, [i])
  }
  return Array.from(groups.values())
}

type EnemyAttackLineCandidate = {
  attackerPos: vec2
  targetPos: vec2
  clippedFrom: vec2
  clippedTo: vec2
  seenRoomUserIds: number[]
  team: unitTeam
  targetsGeneral: boolean
}

function resolveEnemyAttackTarget(
  worldInstance: world,
  attacker: { pos: vec2; team: unitTeam; attackRange: number },
  attackState: AttackCommandState,
  team: unitTeam,
): { point: vec2; targetsGeneral: boolean } | null {
  let targetPoint: vec2 | null = null
  let nearestTargetDist = Infinity
  let targetsGeneral = false

  for (const targetId of attackState.targets) {
    const target = worldInstance.units.get(targetId)
    if (!target || !target.alive || target.isRetreat || target.team === attacker.team) continue
    const dist = Math.hypot(target.pos.x - attacker.pos.x, target.pos.y - attacker.pos.y)
    if (dist > attacker.attackRange) continue
    if (dist >= nearestTargetDist) continue
    nearestTargetDist = dist
    targetPoint = target.pos
    targetsGeneral = target.type === unitType.GENERAL && target.team === team
  }

  if (!targetPoint) return null
  return { point: targetPoint, targetsGeneral }
}

function getEnemyAttackLineObjects(
  worldInstance: world,
  team: unitTeam,
): DirectViewObjectState[] {
  const polygons = getTeamGeneralVisionPolygons(worldInstance, team)
  if (!polygons.length) return []

  const candidates: EnemyAttackLineCandidate[] = []
  for (const unit of worldInstance.units.list()) {
    if (!unit.alive || unit.team === team) continue

    for (const command of unit.getCommands()) {
      if (command.type !== UnitCommandTypes.Attack) continue

      const attackState = command.getState().state as AttackCommandState
      const activeAbilities = (attackState.abilities ?? []).filter((ability) =>
        unit.abilities.includes(ability),
      )
      if (attackState.inaccuracyPoint && getInaccuracyAbility(activeAbilities)) continue

      const target = resolveEnemyAttackTarget(worldInstance, unit, attackState, team)
      if (!target) continue

      const clipped = clipSegmentToVisionPolygons(unit.pos, target.point, polygons)
      if (!clipped) continue
      if (Math.hypot(clipped.to.x - clipped.from.x, clipped.to.y - clipped.from.y) < 0.01) continue

      const seenRoomUserIds = attackLineSeenRoomUserIds(
        worldInstance,
        team,
        clipped.from,
        clipped.to,
      )
      if (seenRoomUserIds == null) continue

      candidates.push({
        attackerPos: unit.pos,
        targetPos: target.point,
        clippedFrom: clipped.from,
        clippedTo: clipped.to,
        seenRoomUserIds,
        team: unit.team,
        targetsGeneral: target.targetsGeneral,
      })
    }
  }

  if (!candidates.length) return []

  const groupRadiusPx = ENEMY_ATTACK_LINE_GROUP_RADIUS_METERS / worldInstance.map.metersPerPixel
  const groups = clusterIndicesByDistance(
    candidates.map((candidate) => candidate.clippedFrom),
    groupRadiusPx,
  )

  const objects: DirectViewObjectState[] = []
  for (const indices of groups) {
    const group = indices.map((index) => candidates[index]!)
    const generalTargets = group.filter((candidate) => candidate.targetsGeneral)
    const attackerPos = averagePoints(group.map((candidate) => candidate.attackerPos))
    const targetPos = averagePoints(
      (generalTargets.length ? generalTargets : group).map((candidate) => candidate.targetPos),
    )
    const clipped = clipSegmentToVisionPolygons(attackerPos, targetPos, polygons)
    const clippedLength = clipped
      ? Math.hypot(clipped.to.x - clipped.from.x, clipped.to.y - clipped.from.y)
      : 0
    let from: vec2
    let to: vec2
    if (clipped && clippedLength >= 0.01) {
      from = clipped.from
      to = clipped.to
    } else {
      const fallback = group.reduce((longest, candidate) => {
        const length = Math.hypot(
          candidate.clippedTo.x - candidate.clippedFrom.x,
          candidate.clippedTo.y - candidate.clippedFrom.y,
        )
        const longestLength = Math.hypot(
          longest.clippedTo.x - longest.clippedFrom.x,
          longest.clippedTo.y - longest.clippedFrom.y,
        )
        return length > longestLength ? candidate : longest
      })
      from = fallback.clippedFrom
      to = fallback.clippedTo
    }
    const seenRoomUserIds = Array.from(
      new Set(group.flatMap((candidate) => candidate.seenRoomUserIds)),
    ).sort((a, b) => a - b)

    objects.push({
      type: 'attack_line',
      team: group[0]!.team,
      seenRoomUserIds,
      data: { from, to },
    })
  }

  return objects
}

function getDirectViewCommands(
  worldInstance: world,
  unitId: string,
  team: unitTeam,
): commandstate[] {
  const unit = worldInstance.units.get(unitId)
  if (!unit || unit.team !== team) return []

  const rawCommands = unit.getCommands().map((command) => command.getState() as commandstate)
  let firstMoveIncluded = false
  let moveChainHiddenByFog = false

  return rawCommands
    .filter((command) => {
      if (command.type !== UnitCommandTypes.Move) return true
      if (!firstMoveIncluded) {
        firstMoveIncluded = true
        return true
      }
      if (moveChainHiddenByFog) return false

      const moveState = command.state as unknown as MoveCommandState
      const isVisible = pointInTeamGeneralVision(worldInstance, team, moveState.target)
      if (!isVisible) {
        moveChainHiddenByFog = true
        return false
      }
      return true
    })
    .map((command) => mapAttackCommandForDirectView(worldInstance, command, unitId, team))
}

function getDirectViewObjects(worldInstance: world, team: unitTeam): DirectViewObjectState[] {
  const objectsByPoint = new Map<string, DirectViewInaccuracyObject>()

  for (const unit of worldInstance.units.list()) {
    if (!unit.alive || unit.team === team) continue

    for (const command of unit.getCommands()) {
      if (command.type !== UnitCommandTypes.Attack) continue

      const attackState = command.getState().state as AttackCommandState
      if (!attackState.inaccuracyPoint) continue

      const activeAbilities = (attackState.abilities ?? []).filter((ability) =>
        unit.abilities.includes(ability),
      )
      const inaccuracyAbility = getInaccuracyAbility(activeAbilities)
      if (!inaccuracyAbility) continue

      const radiusMeters =
        computeInaccuracyRadius(unit, attackState.inaccuracyPoint) *
        (attackState.radiusModifier ?? 1) *
        inaccuracyAbility.radiusMult
      const normalizedRadius = Math.max(0, radiusMeters)
      const seenRoomUserIds = inaccuracyAreaInTeamGeneralVision(
        worldInstance,
        team,
        attackState.inaccuracyPoint,
        normalizedRadius,
      )
      if (seenRoomUserIds == null) continue

      const key = `${attackState.inaccuracyPoint.x}:${attackState.inaccuracyPoint.y}`
      const existing = objectsByPoint.get(key)
      if (existing) {
        existing.data.radiusMeters = Math.max(existing.data.radiusMeters, normalizedRadius)
        const mergedSeenRoomUserIds = new Set([
          ...(existing.seenRoomUserIds ?? []),
          ...seenRoomUserIds,
        ])
        existing.seenRoomUserIds = Array.from(mergedSeenRoomUserIds).sort((a, b) => a - b)
        continue
      }

      objectsByPoint.set(key, {
        type: 'inaccuracy',
        team: unit.team,
        seenRoomUserIds,
        data: {
          point: attackState.inaccuracyPoint,
          radiusMeters: normalizedRadius,
        },
      })
    }
  }

  return [...objectsByPoint.values(), ...getEnemyAttackLineObjects(worldInstance, team)]
}

export function captureUnitPositionsById(worldInstance: world): Map<string, vec2> {
  const positions = new Map<string, vec2>()
  for (const unit of worldInstance.units.list()) {
    positions.set(unit.id, { x: unit.pos.x, y: unit.pos.y })
  }
  return positions
}

function buildTickMoveFrames(from: vec2, to: vec2, durationMs: number): MoveFrame[] | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.01) return null
  return [
    { t: 0, pos: { x: from.x, y: from.y } },
    { t: durationMs, pos: { x: to.x, y: to.y } },
  ]
}

export function buildMoveFramesByUnitId(
  worldInstance: world,
  unitPositionsBeforeTick: Map<string, vec2>,
  durationMs: number,
): Map<string, MoveFrame[]> {
  const framesByUnitId = new Map<string, MoveFrame[]>()
  if (durationMs <= 0) return framesByUnitId

  for (const unit of worldInstance.units.list()) {
    const startPos = unitPositionsBeforeTick.get(unit.id)
    if (!startPos) continue

    const frames = buildTickMoveFrames(startPos, unit.pos, durationMs)
    if (frames) framesByUnitId.set(unit.id, frames)
  }

  return framesByUnitId
}

export function emitTurnStatePackets(
  worldInstance: world,
  directViewFramesByUnitId?: Map<string, MoveFrame[]>,
  deferredPackets?: OutMessage[],
): void {
  const emitPacket = (packet: OutMessage) => {
    if (deferredPackets) {
      deferredPackets.push(structuredClone(packet))
      return
    }
    worldInstance.events.emit('api', packet)
  }

  if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.GENERAL_VISION_UPDATE]) {
    const directViewByTeam = worldInstance.units.getDirectViewByGenerals()
    for (const team of [Team.RED, Team.BLUE]) {
      emitPacket({
        type: 'direct_view',
        team,
        data: directViewByTeam.get(team as unitTeam)!.map(({ id, isDirectChain }) => {
          const unit = worldInstance.units.get(id)!
          let unitState: unitstate
          if (isDirectChain) {
            unitState = {
              id: unit.id,
              type: unit.type,
              team: unit.team,
              pos: unit.pos,
              angle: unit.angle,
              roomMapUserId: unit.roomMapUserId,
              seenRoomUserIds: unit.seenRoomUserIds,
              isDirectChain: true,
              hpLost5min: 0,
              commands: getDirectViewCommands(worldInstance, unit.id, team as unitTeam),
            }
          } else {
            unitState = {
              id: unit.id,
              type: unit.type,
              team: unit.team,
              pos: unit.pos,
              angle: unit.angle,
              roomMapUserId: unit.roomMapUserId,
              seenRoomUserIds: unit.seenRoomUserIds,
              isDirectChain: false,
              isRetreatState: unit.isRetreat,
              hp: unit.hp,
              hpLost5min: unit.getHpLostOverMinutes(5),
              ammo: unit.ammo,
              fatigue: unit.fatigue,
              envState: unit.envState,
              formation: unit.getFormation(),
              activeAbilityType: unit.activeAbilityType,
              commands: getDirectViewCommands(worldInstance, unit.id, team as unitTeam),
            }
          }

          const frames = clipFramesForDirectViewTeam(
            worldInstance,
            directViewFramesByUnitId?.get(unit.id),
            unit.team,
            team as unitTeam,
          )
          return {
            unit: unitState,
            frames: frames && frames.length > 0 ? frames : undefined,
          }
        }),
      })
      emitPacket({
        type: 'direct_view_objects',
        team,
        data: getDirectViewObjects(worldInstance, team as unitTeam),
      })
    }
  }

  if (isWeatherModifiersEnabled()) {
    emitPacket({
      type: 'weather',
      data: worldInstance.newWeather.value,
    })
    worldInstance.weather.value = worldInstance.newWeather.value
  }
}

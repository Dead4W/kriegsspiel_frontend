import { Team } from '@/enums/teamKeys.ts'
import { RoomGameStage } from '@/enums/roomStage.ts'
import { type unitstate, unitType, type uuid } from '@/engine'
import { type ChatMessage } from '@/engine/types/chatMessage.ts'
import { BaseUnit } from '@/engine/units/baseUnit.ts'
import { Messenger } from '@/engine/units/messenger.ts'
import { DeliveryCommand } from '@/engine/units/commands/deliveryCommand.ts'
import { buildMessengerRouteByNearestPoints } from '@/engine/units/messengerRoute.ts'

type Point = { x: number; y: number }

export type RouteTargetUnit = {
  id: string
  alive: boolean
  type: string
  team: Team | string
  visionRange: number
  pos: Point
}

function getUnitsApproxCenter(units: Array<{ pos: Point }>): Point {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const unit of units) {
    minX = Math.min(minX, unit.pos.x)
    minY = Math.min(minY, unit.pos.y)
    maxX = Math.max(maxX, unit.pos.x)
    maxY = Math.max(maxY, unit.pos.y)
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  }
}

export function getSpawnOriginFromMessage(message: ChatMessage, selectedUnits: RouteTargetUnit[]): Point {
  const messageUnits = message.unitIds
    .map((id) => window.ROOM_WORLD.units.get(id))
    .filter((u): u is BaseUnit => Boolean(u && u.alive && u.type !== unitType.MESSENGER))
  if (messageUnits.length > 0) {
    return getUnitsApproxCenter(messageUnits)
  }

  const selectedSameTeam = selectedUnits
    .filter((u) => u.team === message.team && u.alive && u.type !== unitType.MESSENGER)
  if (selectedSameTeam.length > 0) {
    return getUnitsApproxCenter(selectedSameTeam)
  }

  return window.ROOM_WORLD.camera.screenToWorld({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  })
}

function getEnemiesNearPoint(point: Point, friendlyTeam: Team, radiusMeters: number): BaseUnit[] {
  const metersPerPixel = window.ROOM_WORLD.map.metersPerPixel
  const radiusPx = radiusMeters / metersPerPixel
  const radiusSq = radiusPx * radiusPx

  const enemyTeam = friendlyTeam === Team.RED
    ? Team.BLUE
    : friendlyTeam === Team.BLUE
      ? Team.RED
      : null
  if (!enemyTeam) return []

  return window.ROOM_WORLD.units.list().filter((u) => {
    if (!u.alive) return false
    if (u.team !== enemyTeam) return false
    const dx = u.pos.x - point.x
    const dy = u.pos.y - point.y
    return dx * dx + dy * dy <= radiusSq
  })
}

function getSpawnDirection(origin: Point, enemies: BaseUnit[]): Point {
  if (!enemies.length) return { x: 1, y: 0 }

  let sumX = 0
  let sumY = 0
  for (const enemy of enemies) {
    sumX += enemy.pos.x
    sumY += enemy.pos.y
  }

  const enemyCenter = { x: sumX / enemies.length, y: sumY / enemies.length }
  let dx = origin.x - enemyCenter.x
  let dy = origin.y - enemyCenter.y
  const length = Math.hypot(dx, dy)
  if (length < 0.0001) return { x: 1, y: 0 }
  dx /= length
  dy /= length
  return { x: dx, y: dy }
}

function findFreeMessengerSpawnPosition(origin: Point, direction: Point): Point {
  const w = window.ROOM_WORLD
  const map = w.map
  const collisionRangeMeters = BaseUnit.COLLISION_RANGE * map.metersPerPixel
  const stepPx = collisionRangeMeters / map.metersPerPixel
  const unitRadiusSq = stepPx * stepPx

  const perp = { x: -direction.y, y: direction.x }
  const sideOffsets = [0, 1, -1, 2, -2, 3, -3]

  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= map.width && y <= map.height

  const isWaterOrRiver = (x: number, y: number) => {
    const entity = w.getObjectNavMeshEntityAt({ x, y })
    return entity === 'water' || entity === 'river'
  }

  const isFree = (x: number, y: number) =>
    !isWaterOrRiver(x, y) && !w.units.list().some((u) => {
      if (!u.alive) return false
      const dx = u.pos.x - x
      const dy = u.pos.y - y
      return dx * dx + dy * dy < unitRadiusSq
    })

  for (let ring = 1; ring <= 12; ring += 1) {
    for (const side of sideOffsets) {
      const x = origin.x + direction.x * ring * stepPx + perp.x * side * stepPx
      const y = origin.y + direction.y * ring * stepPx + perp.y * side * stepPx
      if (!inBounds(x, y)) continue
      if (isFree(x, y)) return { x, y }
    }
  }

  const fallback = {
    x: Math.max(0, Math.min(map.width, origin.x)),
    y: Math.max(0, Math.min(map.height, origin.y)),
  }
  if (!isWaterOrRiver(fallback.x, fallback.y)) return fallback

  for (let radius = 1; radius <= 24; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = fallback.x + dx
        const y = fallback.y + dy
        if (!inBounds(x, y)) continue
        if (isFree(x, y)) return { x, y }
      }
    }
  }

  return fallback
}

export function getMessengerSpawnPosition(origin: Point, team: Team, radiusMeters = 1000): Point {
  const enemiesNear = getEnemiesNearPoint(origin, team, radiusMeters)
  const direction = getSpawnDirection(origin, enemiesNear)
  return findFreeMessengerSpawnPosition(origin, direction)
}

export function spawnMessengerForMessage(
  message: ChatMessage,
  selectedUnits: RouteTargetUnit[],
  label: string,
): uuid {
  const origin = getSpawnOriginFromMessage(message, selectedUnits)
  const pos = getMessengerSpawnPosition(origin, message.team, 1000)
  const messengerState: unitstate = {
    id: crypto.randomUUID(),
    type: unitType.MESSENGER,
    team: message.team === Team.RED ? 'red' : 'blue',
    pos,
    label,
    messagesLinked: [{ id: message.id, time: window.ROOM_WORLD.time }],
  }
  window.ROOM_WORLD.units.upsert(messengerState)
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
  window.ROOM_WORLD.units.clearSelection()
  window.ROOM_WORLD.units.get(messengerState.id)!.selected = true
  return messengerState.id
}

export function getCurrentPlayerGeneral(team: Team = window.PLAYER.team): BaseUnit | null {
  return window.ROOM_WORLD.units
    .list()
    .find((u) => u.alive && u.team === team && u.type === unitType.GENERAL)
    ?? null
}

export function findLastNonAdminAuthorTeam(unitIds: uuid[]): Team | null {
  const messagesByTime = window.ROOM_WORLD.messages
    .list()
    .filter((message) => (
      message.author_team !== Team.ADMIN
      && message.unitIds.some((unitId) => unitIds.includes(unitId))
    ))
    .sort((a, b) => {
      const aTs = Date.parse(a.created_at ?? a.time)
      const bTs = Date.parse(b.created_at ?? b.time)
      return (Number.isFinite(aTs) ? aTs : 0) - (Number.isFinite(bTs) ? bTs : 0)
    })
  if (!messagesByTime.length) return null
  const last = messagesByTime[messagesByTime.length - 1]!
  if (last.author_team === Team.RED || last.author_team === Team.BLUE) return last.author_team
  return null
}

export function findTeamGeneral(team: Team): BaseUnit | null {
  return window.ROOM_WORLD.units.list().find((u) => (
    u.alive
    && u.team === team
    && u.type === unitType.GENERAL
  )) ?? null
}

export function findHighestHpUnit(units: BaseUnit[]): BaseUnit | null {
  if (!units.length) return null
  return units.slice().sort((a, b) => b.hp - a.hp)[0] ?? null
}

function isVisionLinked(a: RouteTargetUnit, b: RouteTargetUnit): boolean {
  const dx = a.pos.x - b.pos.x
  const dy = a.pos.y - b.pos.y
  const distMeters = Math.hypot(dx, dy) * window.ROOM_WORLD.map.metersPerPixel
  const visionThreshold = Math.min(a.visionRange, b.visionRange)
  return distMeters <= visionThreshold
}

function splitUnitsByVisionGroups(units: RouteTargetUnit[]): RouteTargetUnit[][] {
  if (!units.length) return []

  const pending = new Set<number>(units.map((_, index) => index))
  const groups: RouteTargetUnit[][] = []

  while (pending.size > 0) {
    const startIndex = pending.values().next().value as number
    const queue = [startIndex]
    const groupIndices: number[] = []
    pending.delete(startIndex)

    while (queue.length > 0) {
      const currentIndex = queue.shift()!
      groupIndices.push(currentIndex)
      const current = units[currentIndex]!
      for (const candidateIndex of Array.from(pending)) {
        const candidate = units[candidateIndex]!
        if (!isVisionLinked(current, candidate)) continue
        pending.delete(candidateIndex)
        queue.push(candidateIndex)
      }
    }

    groups.push(groupIndices.map((index) => units[index]!))
  }

  return groups
}

function getApproxGroupCenter(units: RouteTargetUnit[]): Point {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const unit of units) {
    minX = Math.min(minX, unit.pos.x)
    minY = Math.min(minY, unit.pos.y)
    maxX = Math.max(maxX, unit.pos.x)
    maxY = Math.max(maxY, unit.pos.y)
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  }
}

function resolveMessengerRouteTargetPoints(
  selected: RouteTargetUnit[],
  general: BaseUnit | null,
  route: Point[],
): Point[] {
  const candidates = selected
    .filter((unit) => unit.alive && unit.type !== unitType.MESSENGER && unit.type !== unitType.GENERAL)
  if (!candidates.length) return []

  const groups = splitUnitsByVisionGroups(candidates)
  const groupCenters = groups.map((group) => getApproxGroupCenter(group))
  if (!groupCenters.length) return []

  const anchor = route[route.length - 1]
    ?? (general ? { x: general.pos.x, y: general.pos.y } : null)
    ?? groupCenters[0]!
  if (!anchor) return groupCenters
  return buildMessengerRouteByNearestPoints(anchor, groupCenters)
}

function isSamePoint(a: Point, b: Point, eps = 0.001): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps
}

export function getCurrentMessengerRouteFromGeneral(
  general: BaseUnit | null,
  selected: RouteTargetUnit[],
  rawRoutePoints: Point[],
): { raw: Point[]; route: Point[] } {
  const raw = rawRoutePoints.map((p) => ({ x: p.x, y: p.y }))
  if (!general) return { raw, route: [] }

  const route = buildMessengerRouteByNearestPoints(general.pos, raw)
  const routeTargets = resolveMessengerRouteTargetPoints(selected, general, route)
  if (routeTargets.length) {
    const segmentStart = route.length ? route[route.length - 1]! : general.pos
    const finalSegment = buildMessengerRouteByNearestPoints(segmentStart, routeTargets)
    const pointsToAppend = finalSegment.length ? finalSegment : routeTargets
    for (const point of pointsToAppend) {
      if (!route.length || !isSamePoint(route[route.length - 1]!, point)) {
        route.push(point)
      }
    }
  }

  return { raw, route }
}

export function autoSpawnMessengerForIncomingOrder(message: ChatMessage): boolean {
  if (window.PLAYER.team !== Team.ADMIN) return false
  if (window.ROOM_WORLD.stage !== RoomGameStage.WAR) return false
  if (!window.ROOM_WORLD.hasObjectNavMeshMap()) return false
  if (message.author_team === Team.ADMIN) return false
  if (message.deliveryStatus && message.deliveryStatus !== 'pending') return false
  if (message.messengerId && window.ROOM_WORLD.units.get(message.messengerId)) return false

  const alreadySpawned = window.ROOM_WORLD.units.list().some((unit) => (
    unit.type === unitType.MESSENGER
    && unit.messages.some((linkedMessage) => linkedMessage.id === message.id)
  ))
  if (alreadySpawned) return false

  const targetUnits = message.unitIds
    .map((id) => window.ROOM_WORLD.units.get(id))
    .filter((u): u is BaseUnit => Boolean(u && u.alive && u.type !== unitType.MESSENGER))
  if (!targetUnits.length) return false

  const general = window.ROOM_WORLD.units
    .list()
    .find((u) => (
      u.alive
      && u.type === unitType.GENERAL
      && u.team === message.author_team
      && (message.author_id == null || u.roomMapUserId === message.author_id)
    ))
  if (!general) return false

  const messengerState: unitstate = {
    id: crypto.randomUUID(),
    type: unitType.MESSENGER,
    team: general.team,
    pos: { x: general.pos.x, y: general.pos.y },
    label: 'AUTO GENERATED MESSENGER',
    messagesLinked: [{ id: message.id, time: window.ROOM_WORLD.time }],
  }

  const messenger = new Messenger(messengerState)
  messenger.addCommand(new DeliveryCommand({
    targets: message.unitIds,
    instantDelivery: false,
    messageId: message.id,
    messengerId: messengerState.id,
    quotedMessageId: message.quotedMessageId ?? null,
    sourceUnitId: general.id,
    manualRoutePoints: message.routePoints ?? [],
    manualRouteIsPath: true,
    deliveryStatus: 'pending',
  }).getState())

  window.ROOM_WORLD.addUnits([messenger.toState()])
  return true
}

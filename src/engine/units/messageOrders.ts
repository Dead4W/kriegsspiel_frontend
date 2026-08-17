import { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { ChatMessage, ChatMessageObservation } from "@/engine/types/chatMessage.ts";
import type { commandstate, unitstate } from "@/engine/units/types.ts";
import { unitType } from "@/engine/units/types.ts";
import { Team } from "@/enums/teamKeys.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import { ChatMessageStatus } from "@/engine/types/chatMessage.ts";
import { CommandStatus } from "@/engine/units/commands/baseCommand.ts";
import { applyOrderPlanToUnit } from "@/engine/units/orderApply.ts";
import type { UnitOrderPlan } from "@/engine/units/orderApply.ts";

function parseSendMessageTextsFromNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return []
  const messages: string[] = []
  for (const noteRaw of notes) {
    const note = String(noteRaw ?? "")
    if (!note.startsWith("send_message:")) continue
    const text = note.slice("send_message:".length).trim()
    if (!text) continue
    messages.push(text)
  }
  return messages
}

function resolveUnitTeam(unit: BaseUnit): Team | null {
  if (unit.team === Team.RED) return Team.RED
  if (unit.team === Team.BLUE) return Team.BLUE
  return null
}

function getEnemiesNearPoint(point: { x: number; y: number }, friendlyTeam: Team, radiusMeters: number): BaseUnit[] {
  const metersPerPixel = window.ROOM_WORLD.map.metersPerPixel
  const radiusPx = radiusMeters / metersPerPixel
  const radiusSq = radiusPx * radiusPx

  const enemyTeam = friendlyTeam === Team.RED
    ? Team.BLUE
    : friendlyTeam === Team.BLUE
      ? Team.RED
      : null
  if (!enemyTeam) return []

  return window.ROOM_WORLD.units.list().filter((unit) => {
    if (!unit.alive) return false
    if (unit.team !== enemyTeam) return false
    const dx = unit.pos.x - point.x
    const dy = unit.pos.y - point.y
    return dx * dx + dy * dy <= radiusSq
  })
}

function getSpawnDirection(origin: { x: number; y: number }, enemies: BaseUnit[]): { x: number; y: number } {
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

function findFreeMessengerSpawnPosition(
  origin: { x: number; y: number },
  direction: { x: number; y: number }
): { x: number; y: number } {
  const map = window.ROOM_WORLD.map
  const stepPx = BaseUnit.COLLISION_RANGE_METERS / map.metersPerPixel
  const unitRadiusSq = stepPx * stepPx
  const perp = { x: -direction.y, y: direction.x }
  const sideOffsets = [0, 1, -1, 2, -2, 3, -3]

  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= map.width && y <= map.height
  const isWaterOrRiver = (x: number, y: number) => {
    const entity = window.ROOM_WORLD.getObjectNavMeshEntityAt({ x, y })
    return entity === "water" || entity === "river"
  }
  const isFree = (x: number, y: number) =>
    !isWaterOrRiver(x, y) && !window.ROOM_WORLD.units.list().some((unit) => {
      if (!unit.alive) return false
      const dx = unit.pos.x - x
      const dy = unit.pos.y - y
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

function getMessengerSpawnPosition(origin: { x: number; y: number }, team: Team, radiusMeters = 1000) {
  const enemiesNear = getEnemiesNearPoint(origin, team, radiusMeters)
  const direction = getSpawnDirection(origin, enemiesNear)
  return findFreeMessengerSpawnPosition(origin, direction)
}

function spawnMessengerForUnitMessage(message: ChatMessage, sourceUnit: BaseUnit) {
  if (!window.ROOM_WORLD.hasObjectNavMeshMap()) return
  const targetGeneral = window.ROOM_WORLD.units.list().find((unit) => (
    unit.alive
    && unit.type === unitType.GENERAL
    && unit.team === message.team
  )) ?? null
  if (!targetGeneral) return

  const spawnPos = getMessengerSpawnPosition(
    { x: sourceUnit.pos.x, y: sourceUnit.pos.y },
    message.team,
    1000
  )
  const messengerId = crypto.randomUUID()
  const messengerState: unitstate = {
    id: messengerId,
    type: unitType.MESSENGER,
    team: message.team === Team.RED ? "red" : "blue",
    pos: spawnPos,
    label: "GENERATED GENERAL MESSENGER",
    messagesLinked: [{ id: message.id, time: window.ROOM_WORLD.time }],
    commands: [{
      type: UnitCommandTypes.Delivery,
      status: CommandStatus.Pending,
      state: {
        targets: [targetGeneral.id],
        instantDelivery: false,
        messageId: message.id,
        messengerId,
        quotedMessageId: message.quotedMessageId ?? null,
        sourceUnitId: sourceUnit.id,
        manualRoutePoints: message.routePoints ?? [],
        manualRouteIsPath: true,
        deliveryStatus: "pending",
      },
    } as commandstate],
  }
  window.ROOM_WORLD.addUnits([messengerState])
  message.messengerId = messengerId
}

export function emitUnitsLinkedMessage(
  sourceMessage: ChatMessage | null,
  targetUnits: BaseUnit[],
  text: string,
  existingMessengerId: string | null = null,
  observation: ChatMessageObservation | null = null,
  routePoints: Array<{ x: number; y: number }> = [],
): boolean {
  const uniqueUnits = [...new Map(targetUnits.map((unit) => [unit.id, unit])).values()]
  const targetUnit = uniqueUnits[0]
  if (!targetUnit) return false
  const messageTeam = resolveUnitTeam(targetUnit)
  if (!messageTeam) return false
  if (uniqueUnits.some((unit) => resolveUnitTeam(unit) !== messageTeam)) return false
  const existingMessenger = existingMessengerId
    ? window.ROOM_WORLD.units.get(existingMessengerId)
    : null
  const reuseMessenger = Boolean(
    existingMessenger
    && existingMessenger.alive
    && existingMessenger.type === unitType.MESSENGER
    && existingMessenger.team === targetUnit.team
  )

  const outgoing: ChatMessage = {
    id: crypto.randomUUID(),
    author: "Umpire",
    author_team: Team.ADMIN,
    unitIds: uniqueUnits.map((unit) => unit.id),
    text,
    time: window.ROOM_WORLD.time,
    created_at: new Date().toISOString(),
    delivered_at: null,
    quotedMessageId: sourceMessage?.id ?? null,
    messengerId: reuseMessenger ? existingMessenger!.id : null,
    deliveryStatus: reuseMessenger ? "in_transit" : "pending",
    routePoints,
    team: messageTeam,
    status: ChatMessageStatus.Sent,
    delivered: false,
    ...(observation ? { observation } : {}),
  }
  window.ROOM_WORLD.addMessage(outgoing)
  for (const unit of uniqueUnits) {
    unit.linkMessage(outgoing.id)
  }
  if (reuseMessenger) {
    existingMessenger!.linkMessage(outgoing.id)
  } else {
    spawnMessengerForUnitMessage(outgoing, targetUnit)
  }
  return true
}

export function emitUnitLinkedMessage(
  sourceMessage: ChatMessage | null,
  targetUnit: BaseUnit,
  text: string,
  existingMessengerId: string | null = null,
  observation: ChatMessageObservation | null = null,
  routePoints: Array<{ x: number; y: number }> = [],
): boolean {
  return emitUnitsLinkedMessage(sourceMessage, [targetUnit], text, existingMessengerId, observation, routePoints)
}

export function applyReadyMessageOrdersToUnit(
  message: ChatMessage | null | undefined,
  targetUnit: BaseUnit
): boolean {
  const orders = message?.orders;
  if (!message || !orders || orders.status !== "ready") return false;

  const plan = orders.perUnit?.find((item) => item.unitId === targetUnit.id);
  if (!plan) return false;

  const sendMessageTexts = parseSendMessageTextsFromNotes(plan.notes);
  const applied = applyOrderPlanToUnit(message, plan as UnitOrderPlan, targetUnit, {
    preserveCommandTypes: [UnitCommandTypes.Retreat],
    hasExternalEffects: sendMessageTexts.length > 0,
  });
  if (!applied) return false;

  for (const text of sendMessageTexts) {
    emitUnitLinkedMessage(message, targetUnit, text)
  }
  return true;
}

export function applyReadyMessageOrdersToDeliveredUnits(
  message: ChatMessage | null | undefined
): number {
  if (!message?.unitIds?.length) return 0;
  let appliedCount = 0;
  for (const unitId of message.unitIds) {
    const unit = window.ROOM_WORLD.units.get(unitId);
    if (!unit) continue;
    const hasDeliveredMessage = unit.messages.some((linkedMessage) => linkedMessage.id === message.id);
    if (!hasDeliveredMessage) continue;
    if (applyReadyMessageOrdersToUnit(message, unit)) {
      appliedCount += 1;
    }
  }
  return appliedCount;
}

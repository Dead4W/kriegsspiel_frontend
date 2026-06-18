import { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { ChatMessage } from "@/engine/types/chatMessage.ts";
import type { commandstate, UnitAiTriggerState, unitstate } from "@/engine/units/types.ts";
import { unitType } from "@/engine/units/types.ts";
import { Team } from "@/enums/teamKeys.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand.ts";
import { AttackCommand } from "@/engine/units/commands/attackCommand.ts";
import { WaitCommand } from "@/engine/units/commands/waitCommand.ts";
import { RetreatCommand } from "@/engine/units/commands/retreatCommand.ts";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath.ts";
import { ChatMessageStatus } from "@/engine/types/chatMessage.ts";
import { CommandStatus } from "@/engine/units/commands/baseCommand.ts";

function toCommandObjects(rawCommands: unknown[]): Array<MoveCommand | AttackCommand | WaitCommand | RetreatCommand> {
  const commands: Array<MoveCommand | AttackCommand | WaitCommand | RetreatCommand> = [];
  for (const raw of rawCommands) {
    if (!raw || typeof raw !== "object") continue;
    const state = raw as commandstate;
    if (state.type === UnitCommandTypes.Move && state.state) {
      commands.push(new MoveCommand(state.state as MoveCommandState));
    } else if (state.type === UnitCommandTypes.Attack && state.state) {
      commands.push(new AttackCommand(state.state as any));
    } else if (state.type === UnitCommandTypes.Wait && state.state) {
      commands.push(new WaitCommand(state.state as any));
    } else if (state.type === UnitCommandTypes.Retreat && state.state) {
      commands.push(new RetreatCommand(state.state as any));
    }
  }
  return commands;
}

function rebuildMoveCommandsWithRoadPath(
  commands: Array<MoveCommand | AttackCommand | WaitCommand | RetreatCommand>,
  unit: BaseUnit
): Array<MoveCommand | AttackCommand | WaitCommand | RetreatCommand> {
  const roomWorld = window.ROOM_WORLD;
  if (!roomWorld?.hasObjectNavMeshMap()) return commands;

  const rebuilt: Array<MoveCommand | AttackCommand | WaitCommand | RetreatCommand> = [];
  let currentPoint = { x: unit.pos.x, y: unit.pos.y };

  for (const command of commands) {
    if (command.type !== UnitCommandTypes.Move) {
      rebuilt.push(command);
      continue;
    }

    const moveState = command.getState().state as MoveCommandState;
    const routePoints = buildRoadTurnRoutePoints(roomWorld, currentPoint, moveState.target);
    if (!routePoints.length) {
      rebuilt.push(command);
      currentPoint = { x: moveState.target.x, y: moveState.target.y };
      continue;
    }

    routePoints.forEach((point, index) => {
      rebuilt.push(new MoveCommand({
        ...moveState,
        target: { x: point.x, y: point.y },
        orderIndex: index,
        segIndex: index,
      }));
    });

    const tail = routePoints[routePoints.length - 1]!;
    currentPoint = { x: tail.x, y: tail.y };
  }

  return rebuilt;
}

function parseAutoAttackFromNotes(notes: unknown): boolean | null {
  if (!Array.isArray(notes)) return null;
  for (const noteRaw of notes) {
    const note = String(noteRaw ?? "").trim().toLowerCase();
    if (!note.startsWith("set_autoattack:")) continue;
    const value = note.slice("set_autoattack:".length).trim();
    if (value === "on" || value === "true" || value === "1") return true;
    if (value === "off" || value === "false" || value === "0") return false;
  }
  return null;
}

function parseAiTriggersFromNotes(notes: unknown, sourceMessageId: string): {
  hasDirective: boolean;
  triggers: UnitAiTriggerState[];
} {
  if (!Array.isArray(notes)) {
    return { hasDirective: false, triggers: [] };
  }
  const parsedTriggers: UnitAiTriggerState[] = [];
  let hasDirective = false;
  for (const noteRaw of notes) {
    const note = String(noteRaw ?? "").trim();
    if (!note.startsWith("set_ai_triggers:")) continue;
    hasDirective = true;
    const jsonPayload = note.slice("set_ai_triggers:".length);
    let rawTriggers: unknown = [];
    try {
      rawTriggers = JSON.parse(jsonPayload);
    } catch {
      rawTriggers = [];
    }
    if (!Array.isArray(rawTriggers)) continue;
    for (const rawTrigger of rawTriggers) {
      if (!rawTrigger || typeof rawTrigger !== "object") continue;
      const rec = rawTrigger as Record<string, unknown>;
      const triggerType = String(rec.type ?? "").toLowerCase();
      if (triggerType === "on_enemy_distance") {
        const distanceMeters = parseDistanceMeters(
          rec.distanceMeters ?? rec.distance ?? rec.meters
        ) ?? 0;
        if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) continue;
        parsedTriggers.push({
          type: "on_enemy_distance",
          distanceMeters,
          sourceMessageId,
          cooldownSeconds: Number.isFinite(Number(rec.cooldownSeconds))
            ? Math.max(1, Number(rec.cooldownSeconds))
            : 15,
          lastTriggeredAt: null,
        });
        continue;
      }
      if (triggerType === "on_attacked") {
        parsedTriggers.push({
          type: "on_attacked",
          sourceMessageId,
          cooldownSeconds: Number.isFinite(Number(rec.cooldownSeconds))
            ? Math.max(1, Number(rec.cooldownSeconds))
            : 5,
          lastTriggeredAt: null,
        });
      }
    }
  }
  return { hasDirective, triggers: parsedTriggers };
}

function parseDistanceMeters(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    const match = normalized.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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
  const collisionRangeMeters = BaseUnit.COLLISION_RANGE * map.metersPerPixel
  const stepPx = collisionRangeMeters / map.metersPerPixel
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
        manualRoutePoints: [],
        manualRouteIsPath: true,
        deliveryStatus: "pending",
      },
    } as commandstate],
  }
  window.ROOM_WORLD.addUnits([messengerState])
}

function emitUnitLinkedMessage(sourceMessage: ChatMessage, targetUnit: BaseUnit, text: string): boolean {
  const messageTeam = resolveUnitTeam(targetUnit)
  if (!messageTeam) return false

  const outgoing: ChatMessage = {
    id: crypto.randomUUID(),
    author: "Umpire",
    author_team: Team.ADMIN,
    unitIds: [targetUnit.id],
    text,
    time: window.ROOM_WORLD.time,
    created_at: new Date().toISOString(),
    delivered_at: null,
    quotedMessageId: sourceMessage.id,
    deliveryStatus: "pending",
    team: messageTeam,
    status: ChatMessageStatus.Sent,
    delivered: false,
  }
  window.ROOM_WORLD.addMessage(outgoing)
  targetUnit.linkMessage(outgoing.id)
  spawnMessengerForUnitMessage(outgoing, targetUnit)
  return true
}

export function applyReadyMessageOrdersToUnit(
  message: ChatMessage | null | undefined,
  targetUnit: BaseUnit
): boolean {
  const orders = message?.orders;
  if (!message || !orders || orders.status !== "ready") return false;

  const plan = orders.perUnit?.find((item) => item.unitId === targetUnit.id);
  if (!plan) return false;

  const commandsRaw = Array.isArray(plan.commands) ? plan.commands : [];
  const generatedCommands = rebuildMoveCommandsWithRoadPath(
    toCommandObjects(commandsRaw as unknown[]),
    targetUnit
  );
  const nextAutoAttack = parseAutoAttackFromNotes(plan.notes);
  const parsedAiTriggers = parseAiTriggersFromNotes(plan.notes, message.id);
  const sendMessageTexts = parseSendMessageTextsFromNotes(plan.notes);
  const hasEffects = nextAutoAttack != null || parsedAiTriggers.hasDirective || sendMessageTexts.length > 0;
  if (!generatedCommands.length && !hasEffects) return false;

  if (generatedCommands.length) {
    const nonClearCommands = targetUnit.getCommands().filter((command) => (
      command.type === UnitCommandTypes.Retreat
    ));
    targetUnit.manualEnvironment = null;
    targetUnit.setCommands([...nonClearCommands, ...generatedCommands]);
  }

  if (nextAutoAttack != null) {
    targetUnit.setAutoAttack(nextAutoAttack);
  }
  if (parsedAiTriggers.hasDirective) {
    targetUnit.setAiTriggers(parsedAiTriggers.triggers);
  }
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

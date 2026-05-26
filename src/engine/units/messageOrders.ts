import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { ChatMessage } from "@/engine/types/chatMessage.ts";
import type { commandstate } from "@/engine";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand.ts";
import { AttackCommand } from "@/engine/units/commands/attackCommand.ts";
import { WaitCommand } from "@/engine/units/commands/waitCommand.ts";
import { RetreatCommand } from "@/engine/units/commands/retreatCommand.ts";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath.ts";

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

export function applyReadyMessageOrdersToUnit(
  message: ChatMessage | null | undefined,
  targetUnit: BaseUnit
): boolean {
  const orders = message?.orders;
  if (!message || !orders || orders.status !== "ready") return false;

  const plan = orders.perUnit?.find((item) => item.unitId === targetUnit.id);
  if (!plan || !Array.isArray(plan.commands) || !plan.commands.length) return false;

  const generatedCommands = rebuildMoveCommandsWithRoadPath(
    toCommandObjects(plan.commands as unknown[]),
    targetUnit
  );
  if (!generatedCommands.length) return false;

  const nonClearCommands = targetUnit.getCommands().filter((command) => (
    command.type !== UnitCommandTypes.Move
      && command.type !== UnitCommandTypes.Attack
      && command.type !== UnitCommandTypes.Wait
  ));
  targetUnit.manualEnvironment = null;
  targetUnit.setCommands([...nonClearCommands, ...generatedCommands]);
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

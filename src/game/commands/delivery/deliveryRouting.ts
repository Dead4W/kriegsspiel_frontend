import { unitType } from "@/engine";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import { DeliveryCommand } from "@/engine/units/commands/deliveryCommand";
import type { MoveCommandState } from "@/engine/units/commands/moveCommand";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath";

export interface DeliveryPosition {
  x: number;
  y: number;
}

export interface DeliveryRoutingCommand {
  type: UnitCommandTypes;
  getState(): { state: unknown };
  isFinished(unit: unknown): boolean;
}

export interface DeliveryRoutableUnit {
  type: unitType;
  pos: DeliveryPosition;
  alive: boolean;
  getCommands(): DeliveryRoutingCommand[];
}

interface DeliveryRouteTargetOptions<TTarget extends DeliveryRoutableUnit> {
  from: DeliveryPosition;
  targets: TTarget[];
}

export function getMessengerRegularMoveTargets(unit: DeliveryRoutableUnit): DeliveryPosition[] {
  const targets: DeliveryPosition[] = [];
  for (const command of unit.getCommands()) {
    if (command.type !== UnitCommandTypes.Move) continue;
    const moveState = command.getState().state as MoveCommandState;
    if (DeliveryCommand.isDeliveryMoveComment(moveState.comment)) continue;
    targets.push({ x: moveState.target.x, y: moveState.target.y });
  }
  return targets;
}

export function hasPendingRegularMove(unit: DeliveryRoutableUnit): boolean {
  return unit.getCommands().some((command) => {
    if (command.type !== UnitCommandTypes.Move) return false;
    if (command.isFinished(unit)) return false;
    const moveState = command.getState().state as MoveCommandState;
    return !DeliveryCommand.isDeliveryMoveComment(moveState.comment);
  });
}

export function resolveDeliveryTargetByNearestGoal<TTarget extends DeliveryRoutableUnit>(
  options: DeliveryRouteTargetOptions<TTarget>
): TTarget | null {
  const { from, targets } = options;
  if (!targets.length) return null;

  const aliveTargets = targets.filter((unit) => unit.alive);
  if (!aliveTargets.length) return null;

  const distanceToFrom = (target: TTarget) =>
    Math.hypot(target.pos.x - from.x, target.pos.y - from.y);

  const generals = aliveTargets.filter((unit) => unit.type === unitType.GENERAL);
  if (generals.length) {
    return generals.slice().sort((a, b) => distanceToFrom(a) - distanceToFrom(b))[0] ?? null;
  }

  return aliveTargets.slice().sort((a, b) => distanceToFrom(a) - distanceToFrom(b))[0] ?? null;
}

export function buildDeliveryRoutePoints(
  roomWorld: unknown,
  from: DeliveryPosition,
  goal: DeliveryPosition
): DeliveryPosition[] {
  const points = buildRoadTurnRoutePoints(roomWorld, from, goal);
  if (points.length) return points;
  return [{ x: goal.x, y: goal.y }];
}

import { DeliveryCommand } from "@/engine/units/commands/deliveryCommand";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import {
  buildDeliveryRoutePoints,
  getMessengerRegularMoveTargets,
  hasPendingRegularMove,
  resolveDeliveryTargetByNearestGoal,
  type DeliveryRouteWorld,
  type DeliveryRoutableUnit,
  type DeliveryRoutingCommand,
} from "./deliveryRouting";

interface DeliveryOrderUnit extends DeliveryRoutableUnit {
  id: string;
  setCommands(commands: DeliveryRoutingCommand[]): void;
  setDirty(): void;
}

interface ApplyDeliveryOrderOptions<TMessenger extends DeliveryOrderUnit, TTarget extends DeliveryOrderUnit> {
  messengers: TMessenger[];
  targets: TTarget[];
  allTargets: TTarget[];
  roomWorld: DeliveryRouteWorld;
  createUniqueId: () => string;
}

export function applyDeliveryOrder<
  TMessenger extends DeliveryOrderUnit,
  TTarget extends DeliveryOrderUnit,
>(options: ApplyDeliveryOrderOptions<TMessenger, TTarget>): void {
  const { messengers, targets, allTargets, roomWorld, createUniqueId } = options;

  for (const messenger of messengers) {
    const regularMoveTargets = getMessengerRegularMoveTargets(messenger);
    const routeStart = regularMoveTargets.length
      ? regularMoveTargets[regularMoveTargets.length - 1]!
      : { x: messenger.pos.x, y: messenger.pos.y };
    const deliveryTarget = resolveDeliveryTargetByNearestGoal({
      from: routeStart,
      targets: allTargets,
    });

    const deliveryCommand = new DeliveryCommand({
      targets: targets.map((target) => target.id),
    });

    const currentCommands = messenger.getCommands().filter((command) => {
      if (command.type !== UnitCommandTypes.Move) return true;
      const moveState = command.getState().state as MoveCommandState;
      return !DeliveryCommand.isDeliveryMoveComment(moveState.comment);
    });

    const nextCommands = [...currentCommands, deliveryCommand] as DeliveryRoutingCommand[];
    const shouldAppendDeliveryMovesNow = !hasPendingRegularMove(messenger);

    if (deliveryTarget && shouldAppendDeliveryMovesNow) {
      const routePoints = buildDeliveryRoutePoints(roomWorld, routeStart, deliveryTarget.pos);
      const uniqueId = createUniqueId();
      const routeCommands = routePoints.map(
        (point, segmentIndex) =>
          new MoveCommand({
            target: { x: point.x, y: point.y },
            modifier: null,
            comment: DeliveryCommand.DELIVERY_MOVE_COMMENT,
            abilities: [],
            orderIndex: 0,
            uniqueId,
            segIndex: segmentIndex,
            isPatrol: false,
          })
      );
      nextCommands.push(...routeCommands);
    }

    messenger.setCommands(nextCommands);
    messenger.setDirty();
  }
}

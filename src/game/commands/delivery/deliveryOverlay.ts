import type { OverlayItem, OverlayLine } from "@/engine/types/overlayTypes";
import {
  buildDeliveryRoutePoints,
  getMessengerRegularMoveTargets,
  resolveDeliveryTargetByNearestGoal,
  type DeliveryRoutableUnit,
} from "./deliveryRouting";

interface BuildDeliveryOverlayItemsOptions<
  TMessenger extends DeliveryRoutableUnit,
  TTarget extends DeliveryRoutableUnit,
> {
  messengers: TMessenger[];
  targets: TTarget[];
  roomWorld: unknown;
}

export function buildDeliveryOverlayItems<
  TMessenger extends DeliveryRoutableUnit,
  TTarget extends DeliveryRoutableUnit,
>(options: BuildDeliveryOverlayItemsOptions<TMessenger, TTarget>): OverlayItem[] {
  const { messengers, targets, roomWorld } = options;
  if (!messengers.length || !targets.length) return [];

  const items: OverlayItem[] = [];

  for (const messenger of messengers) {
    let from = { x: messenger.pos.x, y: messenger.pos.y };

    for (const moveTarget of getMessengerRegularMoveTargets(messenger)) {
      items.push({
        type: "line",
        from,
        to: moveTarget,
        color: "rgba(34,197,94,0.65)",
        width: 2,
        dash: [6, 6],
      } satisfies OverlayLine);
      from = moveTarget;
    }

    const deliveryTarget = resolveDeliveryTargetByNearestGoal({
      from,
      targets,
    });
    if (!deliveryTarget) continue;

    const deliveryRoute = buildDeliveryRoutePoints(roomWorld, from, deliveryTarget.pos);
    for (const routePoint of deliveryRoute) {
      items.push({
        type: "line",
        from,
        to: routePoint,
        color: "#38bdf8",
        width: 1,
        dash: [4, 6],
      } satisfies OverlayLine);
      from = routePoint;
    }
  }

  return items;
}

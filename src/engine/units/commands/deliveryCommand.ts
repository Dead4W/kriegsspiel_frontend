import {BaseCommand} from "./baseCommand.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {vec2} from "@/engine/types.ts";
import {unitType, type uuid} from "@/engine";
import {buildRoadTurnRoutePoints} from "@/engine/world/roadPath.ts";
import {MoveCommand} from "@/engine/units/commands/moveCommand.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";

export interface DeliveryCommandState {
  targets: uuid[],
  instantDelivery?: boolean,
  delivered?: boolean,
  route?: vec2[],
  routeIndex?: number,
  routeGoal?: vec2 | null,
  deliveryTargetId?: uuid | null,
}

export class DeliveryCommand extends BaseCommand<
  UnitCommandTypes.Delivery,
  DeliveryCommandState
> {
  private static readonly DELIVERY_RANGE_MULTIPLIER = 2;
  static readonly DELIVERY_MOVE_COMMENT = "#delivery#";

  readonly type: UnitCommandTypes.Delivery =
    UnitCommandTypes.Delivery

  constructor(private state: DeliveryCommandState) {
    super()
  }

  private getDeliveryRange(): number {
    return BaseUnit.COLLISION_RANGE * DeliveryCommand.DELIVERY_RANGE_MULTIPLIER;
  }

  private distanceTo(unit: BaseUnit, target: BaseUnit): number {
    return Math.hypot(
      target.pos.x - unit.pos.x,
      target.pos.y - unit.pos.y
    );
  }

  private resolveDeliveryTarget(unit: BaseUnit): BaseUnit | null {
    const targetUnits = this.state.targets
      .map((id) => window.ROOM_WORLD.units.get(id))
      .filter((u): u is BaseUnit => Boolean(u && u.alive));

    if (!targetUnits.length) return null;

    const generals = targetUnits.filter((u) => u.type === unitType.GENERAL);
    if (generals.length) {
      if (this.state.deliveryTargetId) {
        const stored = generals.find((u) => u.id === this.state.deliveryTargetId);
        if (stored) return stored;
      }
      const nearestGeneral = generals
        .slice()
        .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0]!;
      this.state.deliveryTargetId = nearestGeneral.id;
      return nearestGeneral;
    }

    // Fallback: if no general is present in targets, route to nearest target.
    const nearestTarget = targetUnits
      .slice()
      .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0]!;
    this.state.deliveryTargetId = nearestTarget.id;
    return nearestTarget;
  }

  static isDeliveryMoveComment(comment: unknown): boolean {
    return typeof comment === "string" && comment.includes(DeliveryCommand.DELIVERY_MOVE_COMMENT);
  }

  private hasPendingDeliveryMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move) return false;
      if (command.isFinished(unit)) return false;
      const moveState = command.getState().state as MoveCommandState;
      return DeliveryCommand.isDeliveryMoveComment(moveState.comment);
    });
  }

  private hasPendingRegularMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move) return false;
      if (command.isFinished(unit)) return false;
      const moveState = command.getState().state as MoveCommandState;
      return !DeliveryCommand.isDeliveryMoveComment(moveState.comment);
    });
  }

  private buildDeliveryRoute(goal: vec2, from: vec2): vec2[] {
    const points = buildRoadTurnRoutePoints(window.ROOM_WORLD, from, goal);
    if (points.length) return points;
    return [{ x: goal.x, y: goal.y }];
  }

  private ensureDeliveryMoveCommands(unit: BaseUnit): boolean {
    if (this.state.delivered) return false;
    if (this.hasPendingRegularMove(unit)) return false;
    const deliveryTarget = this.resolveDeliveryTarget(unit);
    if (!deliveryTarget) {
      this.state.delivered = true;
      return false;
    }

    if (this.distanceTo(unit, deliveryTarget) <= this.getDeliveryRange()) {
      return false;
    }
    if (this.hasPendingDeliveryMove(unit)) {
      return false;
    }

    const routePoints = this.buildDeliveryRoute(deliveryTarget.pos, unit.pos);
    const uniqueId = crypto.randomUUID();
    const currentCommands = unit.getCommands();
    const routeCommands = routePoints.map((point, segIndex) => new MoveCommand({
      target: {
        x: point.x,
        y: point.y,
      },
      modifier: null,
      comment: DeliveryCommand.DELIVERY_MOVE_COMMENT,
      abilities: [],
      orderIndex: 0,
      uniqueId,
      segIndex,
      isPatrol: false,
    }));

    unit.setCommands([...currentCommands, ...routeCommands]);
    return true;
  }

  private deliver(unit: BaseUnit) {
    const roomUserIds = Array.from(new Set(
      this.state.targets
        .map((id) => window.ROOM_WORLD.units.get(id)?.roomMapUserId ?? 0)
        .filter((id) => id > 0)
    ));

    for (const id of this.state.targets) {
      const u = window.ROOM_WORLD.units.get(id);
      if (!u) continue;
      for (const m of unit.messages) {
        if (u.type === unitType.GENERAL) {
          window.ROOM_WORLD.events.emit('api', {
            type: 'messenger_delivery',
            data: {
              id: m.id,
              roomUserIds,
              time: window.ROOM_WORLD.time
            }
          });
        } else {
          window.ROOM_WORLD.units.withNewCommandsTmp.add(id);
        }
        u.linkMessage(m.id);
        u.setDirty();
      }
    }

    this.state.delivered = true;
    window.ROOM_WORLD.units.remove(unit.id);
  }

  update(unit: BaseUnit, dt: number) {
    void dt;
    if (this.state.delivered) return;
    if (this.state.instantDelivery) {
      this.deliver(unit);
      return;
    }

    const deliveryTarget = this.resolveDeliveryTarget(unit);
    if (!deliveryTarget) {
      this.state.delivered = true;
      return;
    }

    const deliveryRange = this.getDeliveryRange();
    if (this.distanceTo(unit, deliveryTarget) <= deliveryRange) {
      this.deliver(unit);
      return;
    }

    this.ensureDeliveryMoveCommands(unit);
  }

  isFinished(): boolean {
    return Boolean(this.state.delivered)
  }

  estimate(unit: BaseUnit): number {
    if (this.state.delivered) return 0;

    const deliveryTarget = this.resolveDeliveryTarget(unit);
    if (!deliveryTarget) return 0;

    const distPx = this.distanceTo(unit, deliveryTarget);
    const remainPx = Math.max(0, distPx - this.getDeliveryRange());
    if (remainPx <= 0) return 0;

    const speedMetersPerSecond = unit.speed / 60;
    if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond <= 0) return Infinity;
    return Math.ceil(remainPx * window.ROOM_WORLD.map.metersPerPixel / speedMetersPerSecond);
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

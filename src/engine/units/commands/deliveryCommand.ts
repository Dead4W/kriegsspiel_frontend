import {BaseCommand} from "./baseCommand.ts";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {unitType, type uuid} from "@/engine";

export interface DeliveryCommandState {
  targets: uuid[],
}

export class DeliveryCommand extends BaseCommand<
  UnitCommandTypes.Delivery,
  DeliveryCommandState
> {
  private isDelivered: boolean = false;

  readonly type: UnitCommandTypes.Delivery =
    UnitCommandTypes.Delivery

  constructor(private state: DeliveryCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    for (const id of this.state.targets) {
      const u = window.ROOM_WORLD.units.get(id);
      if (!u) continue;
      for (const m of unit.messages) {
        if (u.type === unitType.GENERAL) {
          window.ROOM_WORLD.events.emit('api', {type: 'messenger_delivery', data: {id: m.id, time: window.ROOM_WORLD.time}})
        }
        u.linkMessage(m.id)
        u.setDirty()
      }
    }
    this.isDelivered = true;
    window.ROOM_WORLD.units.remove(unit.id);
  }

  isFinished(): boolean {
    return this.isDelivered
  }

  estimate(unit: BaseUnit): number {
    return 1
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

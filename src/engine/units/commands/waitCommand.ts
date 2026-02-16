import { BaseCommand } from "./baseCommand.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";

export interface WaitCommandState {
  wait: number
  elapsed: number
  comment?: string
}

export class WaitCommand extends BaseCommand<
  UnitCommandTypes.Wait,
  WaitCommandState
> {
  readonly type: UnitCommandTypes.Wait =
    UnitCommandTypes.Wait

  constructor(private state: WaitCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    this.state.elapsed += dt
  }

  isFinished(): boolean {
    if (this.state.wait === 0) return false;
    return this.state.elapsed >= this.state.wait;
  }

  estimate(unit: BaseUnit): number {
    if (this.state.wait === 0) return Infinity;
    return this.state.wait - this.state.elapsed
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

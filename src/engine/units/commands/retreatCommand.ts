  import { BaseCommand, CommandStatus } from "./baseCommand.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";

export interface RetreatCommandState {
  elapsed: number
  duration: number
  comment?: string
}

export class RetreatCommand extends BaseCommand<
  UnitCommandTypes.Retreat,
  RetreatCommandState
> {
  readonly type: UnitCommandTypes.Retreat = UnitCommandTypes.Retreat

  constructor(private state: RetreatCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    this.state.elapsed += dt
    unit.setDirty()
  }

  isFinished(): boolean {
    if (this.state.duration === 0) return false;
    return Math.max(0, this.state.duration - this.state.elapsed) <= 0
  }

  estimate(unit: BaseUnit): number {
    if (this.state.duration === 0) return Infinity;
    return Math.max(0, this.state.duration - this.state.elapsed)
  }

  getState(): { type: UnitCommandTypes.Retreat; status: CommandStatus; state: RetreatCommandState } {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}


  import { BaseCommand, CommandStatus } from "./baseCommand.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";

const RETREAT_DURATION_S = 60 * 60 * 24; // 24 hours

export interface RetreatCommandState {
  elapsed: number
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
    unit.isTimeout = true
    this.state.elapsed += dt
    if (this.isFinished()) {
      unit.isTimeout = false
    }
    unit.setDirty()
  }

  isFinished(): boolean {
    return Math.max(0, RETREAT_DURATION_S - this.state.elapsed) <= 0
  }

  estimate(unit: BaseUnit): number {
    return Math.max(0, RETREAT_DURATION_S - this.state.elapsed)
  }

  getState(): { type: UnitCommandTypes.Retreat; status: CommandStatus; state: RetreatCommandState } {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}


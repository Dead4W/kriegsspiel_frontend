// units/commands/changeFormationCommand.ts
import { BaseCommand } from "./baseCommand.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { FormationType } from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";

const FORMATION_DURATION_MS = 60 * 1 // 1 игровых минут

export interface ChangeFormationCommandState {
  newFormation: FormationType
  elapsed: number
}

export class ChangeFormationCommand extends BaseCommand<
  UnitCommandTypes.ChangeFormation,
  ChangeFormationCommandState
> {
  readonly type: UnitCommandTypes.ChangeFormation =
    UnitCommandTypes.ChangeFormation

  constructor(private state: ChangeFormationCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    this.state.elapsed += dt
    if (this.isFinished()) {
      unit.setFormation(this.state.newFormation)
    }
  }

  isFinished(): boolean {
    return this.state.elapsed >= FORMATION_DURATION_MS
  }

  estimate(unit: BaseUnit): number {
    return FORMATION_DURATION_MS - this.state.elapsed
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

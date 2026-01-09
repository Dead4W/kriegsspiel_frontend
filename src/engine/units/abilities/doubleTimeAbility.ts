import type {StatKey} from "@/engine/units/baseUnit.ts";
import {BaseAbility, UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class DoubleTimeAbility extends BaseAbility {
  name = UnitAbilityType.DOUBLE_TIME_MOVE

  getStatMultiplier(key: StatKey): number {
    if (key === 'speed') return 2
    return 1;
  }
}

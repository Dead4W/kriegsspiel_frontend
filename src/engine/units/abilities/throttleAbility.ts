import type {StatKey} from "@/engine/units/baseUnit.ts";
import {BaseAbility, UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class ThrottleAbility extends BaseAbility {
  name = UnitAbilityType.THROTTLE

  getStatMultiplier(key: StatKey): number {
    if (key === 'speed') return 2
    return 1;
  }
}

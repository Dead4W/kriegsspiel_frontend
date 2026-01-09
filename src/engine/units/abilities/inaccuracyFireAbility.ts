import type {StatKey} from "@/engine/units/baseUnit.ts";
import {BaseAbility, UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class InaccuracyFireAbility extends BaseAbility {
  name = UnitAbilityType.INACCURACY_FIRE

  getStatMultiplier(key: StatKey): number {
    if (key === 'damage') return 0.5
    return 1;
  }
}

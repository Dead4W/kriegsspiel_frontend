import type {StatKey} from "@/engine/units/baseUnit.ts";
import {BaseAbility, UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class ChargeAbility extends BaseAbility {
  name = UnitAbilityType.CHARGE

  getStatMultiplier(key: StatKey): number {
    if (key === 'damage') return 2
    if (key === 'speed') return 4
    if (key === 'takeDamageMod') return 2
    return 1;
  }
}

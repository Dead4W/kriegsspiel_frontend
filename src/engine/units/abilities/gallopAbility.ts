import type {StatKey} from "@/engine/units/baseUnit.ts";
import {BaseAbility, UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class GallopAbility extends BaseAbility {
  name = UnitAbilityType.GALLOP

  getStatMultiplier(key: StatKey): number {
    if (key === 'speed') return 4
    return 1;
  }
}

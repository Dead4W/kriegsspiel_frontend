import {UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";
import {DoubleTimeAbility} from "@/engine/units/abilities/doubleTimeAbility.ts";
import {ChargeAbility} from "@/engine/units/abilities/chargeAbility.ts";
import {InaccuracyFireAbility} from "@/engine/units/abilities/inaccuracyFireAbility.ts";

export function createAbility(abilityType: UnitAbilityType) {
  switch (abilityType) {
    case UnitAbilityType.DOUBLE_TIME_MOVE:
      return new DoubleTimeAbility()
    case UnitAbilityType.CHARGE:
      return new ChargeAbility()
    case UnitAbilityType.INACCURACY_FIRE:
      return new InaccuracyFireAbility()
    default:
      // @ts-ignore
      throw new Error(`Unknown unit type: "${state.type}"`)
  }
}

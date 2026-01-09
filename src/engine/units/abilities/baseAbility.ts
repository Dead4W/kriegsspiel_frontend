import {BaseUnit, type StatKey} from "@/engine/units/baseUnit.ts";

export enum UnitAbilityType {
  DOUBLE_TIME_MOVE = 'double_time_move',
  CHARGE = 'charge',
  INACCURACY_FIRE = 'inaccuracy_fire',
}

export abstract class BaseAbility {
  abstract readonly name: UnitAbilityType

  /** даёт ли модификаторы */
  getStatMultiplier?(
    key: StatKey,
    unit: BaseUnit
  ): number
}

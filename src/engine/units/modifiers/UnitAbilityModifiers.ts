import type {StatKey} from "@/engine/units/baseUnit.ts";

export enum UnitAbilityType {
  DOUBLE_TIME_MOVE = 'double_time_move',
  CHARGE = 'charge',
  GALLOP = 'gallop',
  INACCURACY_FIRE = 'inaccuracy_fire',
  THROTTLE = 'throttle',
}

type AbilityStatKey = StatKey | 'fatigue'

export type AbilityStatMultiplier = Partial<Record<AbilityStatKey, number>>

export const ABILITY_MULTIPLIERS: Record<UnitAbilityType, AbilityStatMultiplier> = {
  [UnitAbilityType.CHARGE]: {
    speed: 5,
    fatigue: 4,
  },

  [UnitAbilityType.DOUBLE_TIME_MOVE]: {
    speed: 2,
    fatigue: 2,
  },

  [UnitAbilityType.GALLOP]: {
    speed: 4,
    fatigue: 3,
  },

  [UnitAbilityType.INACCURACY_FIRE]: {
    damage: 0.5,
  },

  [UnitAbilityType.THROTTLE]: {
    speed: 2,
    fatigue: 2.5,
  },
}

// units/formations/modifiers.ts

import {FormationType} from "@/engine";
import type {UnitStats} from "@/engine/units/baseUnit.ts";

export const FORMATION_STAT_MULTIPLIERS: Record<
  FormationType,
  Partial<Record<keyof UnitStats | 'damage', number>>
> = {
  [FormationType.Default]: {},

  [FormationType.Springing]: {
    takeDamageMod: 1.2,
    speed: 0.5,
  },

  [FormationType.KneelingVolley]: {
    takeDamageMod: 2.0,
    damage: 0.9,
  },

  [FormationType.ForceWalking]: {
    takeDamageMod: 4.0,
    damage: 0.8,
  },

  [FormationType.OnHorse]: {
    takeDamageMod: 8.0,
    damage: 0.12,
    speed: 1.25,
  },

  [FormationType.Column]: {
    takeDamageMod: 16.0,
  },
}

// units/formations/modifiers.ts

import {FormationType} from "@/engine";
import type {UnitStats} from "@/engine/units/baseUnit.ts";

export const FORMATION_STAT_MULTIPLIERS: Record<
  FormationType,
  Partial<Record<keyof UnitStats | 'damage', number>>
> = {
  [FormationType.Default]: {},

  [FormationType.Springing]: {
    defense: 1.2,
    speed: 0.5,
  },

  [FormationType.KneelingVolley]: {
    defense: 2.0,
    damage: 0.9,
  },

  [FormationType.ForceWalking]: {
    defense: 4.0,
    damage: 0.8,
  },

  [FormationType.OnHorse]: {
    defense: 8.0,
    damage: 0.12,
  },

  [FormationType.Column]: {
    defense: 16.0,
  },
}

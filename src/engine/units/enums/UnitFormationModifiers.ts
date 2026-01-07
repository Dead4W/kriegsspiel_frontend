// units/formations/modifiers.ts

import {FormationType} from "@/engine";
import type {UnitStats} from "@/engine/units/baseUnit.ts";

export const FORMATION_STAT_MULTIPLIERS: Record<
  FormationType,
  Partial<Record<keyof UnitStats | 'damage', number>>
> = {
  [FormationType.Default]: {},

  [FormationType.Line]: {
    // attackRange: 1.1,
    // defense: 0.9,
  },

  [FormationType.Column]: {
    // speed: 1.1,
    // visionRange: 0.9,
  },

  [FormationType.Wedge]: {
    // damage: 1.15,
    // defense: 1.1,
    // speed: 0.9,
  },

  [FormationType.Circle]: {},
}

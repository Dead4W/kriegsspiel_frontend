import type {StatKey} from "@/engine/units/baseUnit.ts";

export enum TimeOfDay {
  Morning = 'morning',
  Day = 'day',
  Evening = 'evening',
  Night = 'night',
}


export type TimeStatMultiplier = Partial<Record<StatKey, number>>

export const TIME_MULTIPLIERS: Record<TimeOfDay, TimeStatMultiplier> = {
  [TimeOfDay.Morning]: {},

  [TimeOfDay.Day]: {},

  [TimeOfDay.Evening]: {
    visionRange: 0.85,
    attackRange: 0.9,
  },

  [TimeOfDay.Night]: {
    visionRange: 0.6,
    attackRange: 0.75,
    speed: 0.9,
  },
}

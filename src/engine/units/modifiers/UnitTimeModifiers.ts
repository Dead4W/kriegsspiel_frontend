import type {StatKey} from "@/engine/units/baseUnit.ts";
import { getResourcePack } from "@/engine/assets/resourcepack.ts";
import {
  type TimeOfDay
} from "@/engine/resourcePack/timeOfDay.ts";

export type TimeStatMultiplier = Partial<Record<StatKey, number>>

export function getTimeMultipliers(): Record<TimeOfDay, TimeStatMultiplier> {
  const pack = getResourcePack()?.timeOfDay?.segments ?? []
  const result = {} as Record<TimeOfDay, TimeStatMultiplier>
  for (const segment of pack) {
    result[segment.id] = segment.multipliers ?? {}
  }
  return result
}

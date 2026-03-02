import type {StatKey} from "@/engine/units/baseUnit.ts";
import { getAbilityMultipliers as getAbilityMultipliersFromPack } from "@/engine/resourcePack/abilities.ts";

// Ability ids are defined by the loaded resourcepack.
export type UnitAbilityType = string

type AbilityStatKey = StatKey | 'fatigue'

export type AbilityStatMultiplier = Partial<Record<AbilityStatKey, number>>

export function getAbilityMultipliers(): Record<UnitAbilityType, AbilityStatMultiplier> {
  return getAbilityMultipliersFromPack()
}

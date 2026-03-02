import type { FormationType } from "@/engine/units/types.ts";
import type { StatKey } from "@/engine/units/baseUnit.ts";
import { getFormationMultipliers as getFormationMultipliersFromPack } from "@/engine/resourcePack/formations.ts";

export type FormationStatMultiplier = Partial<Record<StatKey, number>>

export function getFormationMultipliers(): Record<FormationType, FormationStatMultiplier> {
  return getFormationMultipliersFromPack() as any
}

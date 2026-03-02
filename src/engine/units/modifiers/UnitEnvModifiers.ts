import { unitType } from "@/engine";
import type { StatKey } from "@/engine/units/baseUnit.ts";
import { getEnvMultipliers as getEnvMultipliersFromPack } from "@/engine/resourcePack/environment.ts";

export interface EnvStatMultiplier {
  takeDamageMod?: number
  damage?: number
  attackRange?: number
  visionRange?: number
  speed?: number
  byTypes?: Partial<Record<unitType, EnvStatMultiplierByUnit>>
}

export interface EnvStatMultiplierByUnit {
  takeDamageMod?: number
  damage?: number
  attackRange?: number
  visionRange?: number
  speed?: number
}

export type EnvStatKey = StatKey

export function getEnvMultipliers(): Record<string, EnvStatMultiplier> {
  return getEnvMultipliersFromPack()
}

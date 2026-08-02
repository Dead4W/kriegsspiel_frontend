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

/**
 * What one environment state does to one stat for one kind of unit.
 *
 * A per-type entry *replaces* the shared multiplier rather than stacking with
 * it, which is what lets a pack say that a river merely slows infantry but
 * stops guns. Undefined when the state says nothing about this stat.
 */
export function getEnvStatMultiplier(
  state: string,
  key: StatKey,
  forUnitType?: string,
): number | undefined {
  const multipliers = getEnvMultipliers()[state]
  if (!multipliers) return undefined

  const byType = forUnitType
    ? multipliers.byTypes?.[forUnitType as unitType]?.[key]
    : undefined
  return byType ?? multipliers[key]
}

/** The combined effect of every state a unit is in, on one stat. */
export function getEnvStatMultiplierFor(
  states: string[],
  key: StatKey,
  forUnitType?: string,
): number {
  return states.reduce((total, state) => {
    const multiplier = getEnvStatMultiplier(state, key, forUnitType)
    return multiplier === undefined ? total : total * multiplier
  }, 1)
}

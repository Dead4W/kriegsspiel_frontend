import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'

import type {
  AbilityStatMultiplier,
  UnitAbilityType,
} from '@/engine/units/modifiers/UnitAbilityModifiers'

export type Ability = UnitAbilityType

export type AbilityParams = {
  /** Multiplies computed inaccuracy radius (artillery "area fire"). */
  radius?: number
}

export type ResourcePackAbility = {
  id: Ability | string
  multipliers?: AbilityStatMultiplier
  params?: AbilityParams
}

function normalizeAbility(raw: unknown): ResourcePackAbility | null {
  if (!isObject(raw)) return null
  const id = String(raw.id ?? '')
  if (!id) return null

  let multipliers: ResourcePackAbility['multipliers'] | undefined
  if (isObject(raw.multipliers)) {
    const stats: Record<string, number> = {}
    for (const [statKey, statRaw] of Object.entries(raw.multipliers)) {
      const n = toFiniteNumber(statRaw)
      if (n == null) continue
      stats[String(statKey)] = n
    }
    multipliers = stats as AbilityStatMultiplier
  }

  let params: ResourcePackAbility['params'] | undefined
  if (isObject(raw.params)) {
    const radius = toFiniteNumber(raw.params.radius)
    params = {
      radius: radius == null ? undefined : radius,
    }
  }

  return {
    id: id as Ability,
    multipliers,
    params,
  }
}

export function getResourcePackAbilities(
  pack: ResourcePack | null = getResourcePack()
): ResourcePackAbility[] {
  const raw = pack?.abilities?.types
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeAbility).filter(Boolean) as ResourcePackAbility[]
}

export function getAbilityMultipliers(
  pack: ResourcePack | null = getResourcePack()
): Record<Ability, AbilityStatMultiplier> {
  const types = getResourcePackAbilities(pack)
  const result = {} as Record<Ability, AbilityStatMultiplier>
  for (const t of types) result[t.id as Ability] = t.multipliers ?? {}
  return result
}

export function getAbilityParams(
  pack: ResourcePack | null = getResourcePack()
): Record<Ability, AbilityParams> {
  const types = getResourcePackAbilities(pack)
  const result = {} as Record<Ability, AbilityParams>
  for (const t of types) result[t.id as Ability] = t.params ?? {}
  return result
}

export function getAbilityInaccuracyRadiusMultiplier(
  ability: Ability,
  pack: ResourcePack | null = getResourcePack()
): number | null {
  const radius = getAbilityParams(pack)?.[ability]?.radius
  return typeof radius === 'number' && Number.isFinite(radius) ? radius : null
}

export function hasAbilityInaccuracyRadius(
  ability: Ability,
  pack: ResourcePack | null = getResourcePack()
): boolean {
  return getAbilityInaccuracyRadiusMultiplier(ability, pack) != null
}

export function getInaccuracyAbility(
  abilities: Ability[],
  pack: ResourcePack | null = getResourcePack()
): { ability: Ability; radiusMult: number } | null {
  for (const a of abilities) {
    const radiusMult = getAbilityInaccuracyRadiusMultiplier(a, pack)
    if (radiusMult != null) return { ability: a, radiusMult }
  }
  return null
}


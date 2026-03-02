import { BaseUnit } from '@/engine/units/baseUnit'
import type { UnitStats } from '@/engine/units/baseUnit'
import { type unitstate, type unitType, type FormationType } from '@/engine/units/types'
import type { UnitAbilityType } from '@/engine/units/modifiers/UnitAbilityModifiers'
import { getUnitTypeDef } from '@/engine/resourcePack/units'

export type GenericUnitFallbackDef = {
  stats: UnitStats
  abilities: UnitAbilityType[]
  defaultFormation?: FormationType
}

export class GenericUnit extends BaseUnit {
  type: unitType
  stats: UnitStats
  abilities: UnitAbilityType[]

  constructor(s: unitstate, fallback?: GenericUnitFallbackDef) {
    super(s)

    const def = getUnitTypeDef(s.type)
    if (!def && !fallback) {
      throw new Error(`resourcepack_missing_unit_type:${s.type}`)
    }
    const resolved = def ?? {
      id: s.type,
      stats: fallback!.stats,
      abilities: fallback!.abilities,
      defaultFormation: fallback!.defaultFormation,
    }

    this.type = s.type
    this.stats = resolved.stats
    this.abilities = resolved.abilities

    this.initStats(s)

    if (!s.formation && resolved.defaultFormation) {
      this.formation = resolved.defaultFormation
    }
  }
}


import type { MoraleCheckConfig } from '@/engine/resourcePack/moraleCheck'
import type { UnitStats } from '@/engine/units/baseUnit'

export type CoreStatKey =
  | 'damage'
  | 'takeDamageMod'
  | 'speed'
  | 'attackRange'
  | 'visionRange'

export type TimeStatKey = CoreStatKey

export type TimeOfDaySegment = {
  id: string
  title?: string
  start: number
  end: number
  multipliers?: Partial<Record<TimeStatKey, number>>
}

export type WeatherStatKey = CoreStatKey

export type WeatherEffect =
  | {
      type: 'fog'
      mult?: number
    }
  | {
      type: 'clouds'
    }

export type WeatherCondition = {
  id: string
  title?: string
  multipliers?: Partial<Record<WeatherStatKey, number>>
  effect?: WeatherEffect
}

export type EnvironmentStatKey = CoreStatKey

export type EnvironmentState = {
  id: string
  title?: string
  icon?: string
  isRoute?: boolean
  params?: {
    moraleCheckMod?: number
    [key: string]: unknown
  }
  multipliers?: Partial<Record<EnvironmentStatKey, number>>
  byTypes?: Partial<Record<string, Partial<Record<EnvironmentStatKey, number>>>>
}

export type FormationStatKey = CoreStatKey

export type FormationState = {
  id: string
  title?: string
  icon?: string
  multipliers?: Partial<Record<FormationStatKey, number>>
}

export type AbilityStatKey = CoreStatKey | 'fatigue'

export type AbilityState = {
  id: string
  title?: string
  multipliers?: Partial<Record<AbilityStatKey, number>>
  params?: {
    radius?: number
  }
}

export type ResourcePackInaccuracy = {
  heightFactor?: number
  distanceFactor?: number
}

export type ResourcePackAngleModifier = {
  angle: number
  modifier: number
}

export type ResourcePackDistanceModifierPoint = {
  distance: number
  modifier: number
}

export type ResourcePackDistanceModifiers = Record<string, ResourcePackDistanceModifierPoint[]>

export type ResourcePackUnitStats = UnitStats

export type ResourcePackUnitParams = {
  textureUrl?: string
  renderIcon?: string
  renderWidthMult?: number
  renderHeightMult?: number
  priorityTargets?: number
  attackIgnoreHeightModifier?: boolean
  attackIgnoreTargetEnvs?: string[]
  attackIgnoreTargetEnvMult?: number
  moraleCheckMod?: number
  [key: string]: unknown
}

export type ResourcePackUnitType = {
  id: string
  title?: string
  stats: ResourcePackUnitStats
  abilities?: string[]
  defaultFormation?: string
  params?: ResourcePackUnitParams
}

export type ResourcePackDraft = {
  timeOfDay?: {
    segments?: TimeOfDaySegment[]
  }
  weather?: {
    conditions?: WeatherCondition[]
  }
  environment?: {
    states?: EnvironmentState[]
  }
  formations?: {
    types?: FormationState[]
  }
  abilities?: {
    types?: AbilityState[]
  }
  inaccuracy?: ResourcePackInaccuracy
  moraleCheck?: MoraleCheckConfig
  angleModifiers?: ResourcePackAngleModifier[]
  distanceModifiers?: ResourcePackDistanceModifiers
  units?: {
    types?: ResourcePackUnitType[]
  }
  [key: string]: unknown
}

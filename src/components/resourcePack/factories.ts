import type { MoraleCheckConfig } from '@/engine/resourcePack/moraleCheck'
import type {
  AbilityState,
  EnvironmentState,
  FormationState,
  ResourcePackAngleModifier,
  ResourcePackDistanceModifierPoint,
  ResourcePackUnitType,
  TimeOfDaySegment,
  WeatherCondition,
} from '@/components/resourcePack/types'

export function createWeatherCondition(index = 1): WeatherCondition {
  return {
    id: `weather_${index}`,
    title: `Weather ${index}`,
    multipliers: {},
  }
}

export function createInitialCondition(): WeatherCondition {
  return createWeatherCondition()
}

export function createTimeSegment(index: number, fallbackStart = 0): TimeOfDaySegment {
  return {
    id: `time_${index}`,
    title: `Time ${index}`,
    start: fallbackStart,
    end: fallbackStart,
    multipliers: {},
  }
}

export function createInitialTimeSegment(): TimeOfDaySegment {
  return {
    id: 'morning',
    title: 'Morning',
    start: 6,
    end: 12,
    multipliers: {},
  }
}

export function createEnvironmentState(index = 1): EnvironmentState {
  return {
    id: `env_${index}`,
    title: `Environment ${index}`,
    multipliers: {},
  }
}

export function createInitialEnvironmentState(): EnvironmentState {
  return createEnvironmentState()
}

export function createFormationState(index = 1): FormationState {
  return {
    id: `formation_${index}`,
    title: `Formation ${index}`,
    multipliers: {},
  }
}

export function createInitialFormationType(): FormationState {
  return createFormationState()
}

export function createAbilityState(index = 1): AbilityState {
  return {
    id: `ability_${index}`,
    title: `Ability ${index}`,
    multipliers: {},
  }
}

export function createInitialAbilityType(): AbilityState {
  return createAbilityState()
}

export function createUnitType(index = 1): ResourcePackUnitType {
  return {
    id: `unit_${index}`,
    title: `Unit ${index}`,
    stats: {
      maxHp: 64,
      damage: 1,
      speed: 80,
      takeDamageMod: 1,
      attackRange: 2000,
      visionRange: 1000,
      ammoMax: 10,
    },
    abilities: [],
  }
}

export function createInitialUnitType(): ResourcePackUnitType {
  return {
    id: 'infantry',
    title: 'Infantry',
    stats: {
      maxHp: 64,
      damage: 1,
      speed: 80,
      takeDamageMod: 1,
      attackRange: 2000,
      visionRange: 1000,
      ammoMax: 10,
    },
    abilities: [],
    params: {
      renderIcon: 'I',
    },
  }
}

export function createInitialMoraleCheck(): MoraleCheckConfig {
  return {
    dice: { count: 2, sides: 6 },
    commander: { radiusMeters: 300, penalty: -2 },
    lossPenalties: [
      { lossesMoreThan: 0.25, penalty: -2, key: 'losses>25%' },
      { lossesMoreThan: 0.35, penalty: -1, key: 'losses>35%' },
      { lossesMoreThan: 0.5, penalty: -2, key: 'losses>50%' },
    ],
    outcomes: [
      { minTotal: 0, id: 'pass' },
      { minTotal: -2, id: 'retreat' },
      { minTotal: -5, id: 'flee' },
      { minTotal: -9999, id: 'disband' },
    ],
    effects: {
      retreatDurationSeconds: 60 * 60 * 12,
      fleeDurationMultiplier: 2,
      fleeHpMultiplier: 0.5,
    },
  }
}

export function createAngleModifier(angle = 0, modifier = 1): ResourcePackAngleModifier {
  return {
    angle,
    modifier,
  }
}

export function createInitialAngleModifier(): ResourcePackAngleModifier {
  return createAngleModifier(-6, 0.5)
}

export function createDistanceModifierPoint(distance = 200, modifier = 1): ResourcePackDistanceModifierPoint {
  return {
    distance,
    modifier,
  }
}

export function createInitialDistanceModifierPoint(): ResourcePackDistanceModifierPoint {
  return createDistanceModifierPoint(200, 1)
}

import { UnitEnvironmentState } from './UnitStates'

export interface EnvStatMultiplier {
  defense?: number
  damage?: number
  attackRange?: number
  visionRange?: number
  speed?: number
}

export const ENV_MULTIPLIERS: Record<UnitEnvironmentState, EnvStatMultiplier> = {
  [UnitEnvironmentState.InHouse]: {
    defense: 1.2,
    visionRange: 1.1,
  },

  [UnitEnvironmentState.InCoverHouse]: {
    defense: 1.5,
    visionRange: 1.1,
  },

  [UnitEnvironmentState.InForest]: {
    defense: 1.5,
    attackRange: 0.9,
    visionRange: 0.6,
    speed: 0.7,
  },

  [UnitEnvironmentState.OnRoad]: {
    visionRange: 1.2,
    speed: 1.15,
  },

  [UnitEnvironmentState.OnGoodRoad]: {
    visionRange: 1.2,
    speed: 1.5,
  },

  [UnitEnvironmentState.InWater]: {
    defense: 0.8,
    attackRange: 0.8,
    visionRange: 0.7,
    speed: 0.5,
  },
}

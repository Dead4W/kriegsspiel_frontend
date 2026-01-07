import { UnitEnvironmentState } from './UnitStates'
import {unitType} from "@/engine";

export interface EnvStatMultiplier {
  defense?: number
  damage?: number
  attackRange?: number
  visionRange?: number
  speed?: number
  byTypes?: Partial<Record<unitType, EnvStatMultiplierByUnit>>
}

export interface EnvStatMultiplierByUnit {
  defense?: number
  damage?: number
  attackRange?: number
  visionRange?: number
  speed?: number
}

export const ENV_MULTIPLIERS: Record<UnitEnvironmentState, EnvStatMultiplier> = {
  [UnitEnvironmentState.InField]: {
    speed: 1,
  },

  [UnitEnvironmentState.InPlainField]: {
    speed: 0.75,
    byTypes: {
      [unitType.ARTILLERY]: {
        speed: 0.5,
      }
    }
  },

  [UnitEnvironmentState.InSoftField]: {
    speed: 0.5,
    byTypes: {
      [unitType.ARTILLERY]: {
        speed: 0.25,
      }
    }
  },

  [UnitEnvironmentState.InSwampOrDirty]: {
    defense: 0.25,
    speed: 0.25,
  },

  [UnitEnvironmentState.InHouse]: {
    defense: 0.25,
  },

  [UnitEnvironmentState.InCoverHouse]: {
    defense: 0.06,
  },

  [UnitEnvironmentState.InBrench]: {
    defense: 0.9,
  },

  [UnitEnvironmentState.InCoverTrenches]: {
    defense: 0.12,
  },

  [UnitEnvironmentState.InForest]: {
    defense: 0.5,
    speed: 0.5,
    byTypes: {
      [unitType.ARTILLERY]: {
        speed: 0.25,
      }
    }
  },

  [UnitEnvironmentState.OnRoad]: {
    speed: 1,
  },

  [UnitEnvironmentState.OnGoodRoad]: {
    speed: 1.1,
  },

  [UnitEnvironmentState.InWater]: {
    defense: 0.4,
  },
}

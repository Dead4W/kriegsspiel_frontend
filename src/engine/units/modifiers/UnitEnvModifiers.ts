import { UnitEnvironmentState } from '../enums/UnitStates.ts'
import {unitType} from "@/engine";

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
    takeDamageMod: 0.25,
    speed: 0.25,
    byTypes: {
      [unitType.ARTILLERY]: {
        speed: 0.1,
      }
    }
  },

  [UnitEnvironmentState.InHouse]: {
    takeDamageMod: 0.25,
  },

  [UnitEnvironmentState.InCoverHouse]: {
    takeDamageMod: 0.06,
  },

  [UnitEnvironmentState.InBrench]: {
    takeDamageMod: 0.9,
  },

  [UnitEnvironmentState.InCoverTrenches]: {
    takeDamageMod: 0.12,
  },

  [UnitEnvironmentState.InForest]: {
    takeDamageMod: 0.5,
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
    takeDamageMod: 0.4,
    byTypes: {
      [unitType.ARTILLERY]: {
        speed: 0.1,
      }
    }
  },
}

import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'

export class Cavalry extends BaseUnit {
  type: unitType = unitType.CAVALRY

  stats: UnitStats = {
    maxHp: 64,
    damage: 18,
    speed: 600,
    defense: 1,
    attackRange: 80,
    visionRange: 1000,
  }

  abilities = ['charge', 'overrun']

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

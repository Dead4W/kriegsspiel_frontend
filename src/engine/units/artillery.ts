import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {type unitstate, unitType} from './types'

export class Artillery extends BaseUnit {
  type: unitType = unitType.ARTILLERY

  stats: UnitStats = {
    maxHp: 64,
    damage: 1,
    speed: 80,
    defense: 1,
    attackRange: 4500,
    visionRange: 1000,
    ammoMax: 10,
  }

  abilities = ['bombard', 'indirect_fire']

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

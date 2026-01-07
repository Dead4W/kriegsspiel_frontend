import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'

export class Infantry extends BaseUnit {
  type: unitType = unitType.INFANTRY

  stats: UnitStats = {
    maxHp: 64,
    damage: 1,
    speed: 80,
    defense: 1,
    attackRange: 1000,
    visionRange: 1000,
    ammoMax: 30,
  }

  abilities = ['fire', 'entrench']

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

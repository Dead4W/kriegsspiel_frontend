import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'

export class Militia extends BaseUnit {
  type: unitType = unitType.MILITIA

  stats: UnitStats = {
    maxHp: 64,
    damage: 4,
    speed: 400,
    defense: 1,
    attackRange: 90,
    visionRange: 1000,
    ammoMax: 15,
  }

  abilities = ['irregular']

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'

export class Marine extends BaseUnit {
  type: unitType = unitType.MARINE

  stats: UnitStats = {
    maxHp: 64,
    damage: 2,
    speed: 80,
    takeDamageMod: 1,
    attackRange: 1000,
    visionRange: 1000,
    ammoMax: 25,
  }

  abilities = []

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

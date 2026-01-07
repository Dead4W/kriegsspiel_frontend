import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'

export class Marine extends BaseUnit {
  type: unitType = unitType.MARINE

  stats: UnitStats = {
    maxHp: 64,
    damage: 15,
    speed: 400,
    defense: 1,
    attackRange: 130,
    visionRange: 1000,
    ammoMax: 25,
  }

  abilities = ['amphibious', 'boarding']

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

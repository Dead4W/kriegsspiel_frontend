import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {type unitstate, unitType} from './types'

export class Messenger extends BaseUnit {
  type: unitType = unitType.MESSENGER

  stats: UnitStats = {
    maxHp: 1,
    damage: 1,
    speed: 80,
    defense: 1,
    attackRange: 1000,
    visionRange: 1000,
    ammoMax: 0,
  }

  abilities = []

  constructor(s: unitstate) {
    super(s)
    this.initStats(s)
  }
}

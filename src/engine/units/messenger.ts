import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {type unitstate, unitType} from './types'

export class Messenger extends BaseUnit {
  type: unitType = unitType.MESSENGER

  stats: UnitStats = {
    maxHp: 1,
    damage: 0.01,
    speed: 400,
    takeDamageMod: 1,
    attackRange: 2000,
    visionRange: 1000,
    ammoMax: 1,
  }

  abilities = []

  constructor(s: unitstate) {
    super(s)
    this.initStats(s)
  }
}

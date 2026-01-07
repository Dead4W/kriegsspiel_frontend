import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {type unitstate, unitType} from './types'

export class Gatling extends BaseUnit {
  type: unitType = unitType.GATLING

  stats: UnitStats = {
    maxHp: 64,
    damage: 100,
    speed: 400,
    defense: 1,
    attackRange: 400,
    visionRange: 1000,
    ammoMax: 10,
  }

  abilities = []

  constructor(s: unitstate) {
    super(s)
    this.initStats(s)
  }
}

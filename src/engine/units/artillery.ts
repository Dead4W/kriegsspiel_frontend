import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {type unitstate, unitType} from './types'
import {UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class Artillery extends BaseUnit {
  type: unitType = unitType.ARTILLERY

  stats: UnitStats = {
    maxHp: 64,
    damage: 1,
    speed: 80,
    takeDamageMod: 1,
    attackRange: 4500,
    visionRange: 1000,
    ammoMax: 10,
  }

  abilities = [UnitAbilityType.INACCURACY_FIRE]

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";

export class Militia extends BaseUnit {
  type: unitType = unitType.MILITIA

  stats: UnitStats = {
    maxHp: 64,
    damage: 0.5,
    speed: 80,
    takeDamageMod: 1,
    attackRange: 2000,
    visionRange: 1000,
    ammoMax: 5,
  }

  abilities = [UnitAbilityType.DOUBLE_TIME_MOVE]

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

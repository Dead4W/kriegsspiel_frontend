import { BaseUnit } from './baseUnit'
import type { UnitStats } from './baseUnit'
import {type unitstate, unitType} from './types'
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";

export class Infantry extends BaseUnit {
  type: unitType = unitType.INFANTRY

  stats: UnitStats = {
    maxHp: 64,
    damage: 1,
    speed: 80,
    takeDamageMod: 1,
    attackRange: 2000,
    visionRange: 1000,
    ammoMax: 10,
  }

  abilities = [UnitAbilityType.DOUBLE_TIME_MOVE]

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
  }
}

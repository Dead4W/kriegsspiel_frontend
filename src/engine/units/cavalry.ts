import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {FormationType, type unitstate, unitType} from './types'
import {UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export class Cavalry extends BaseUnit {
  type: unitType = unitType.CAVALRY

  stats: UnitStats = {
    maxHp: 64,
    damage: 0.6,
    speed: 80,
    takeDamageMod: 1,
    attackRange: 2000,
    visionRange: 1000,
  }

  abilities = [UnitAbilityType.CHARGE]

  constructor(s: unitstate) {
    super(s)
    this.initStats(s) // ✅ ВАЖНО
    this.formation = s.formation ?? FormationType.OnHorse
  }
}

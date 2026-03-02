import {type unitstate, unitType} from './types'
import { GenericUnit } from "@/engine/units/genericUnit.ts";

export class General extends GenericUnit {
  type: unitType = unitType.GENERAL

  constructor(s: unitstate) {
    super(s, {
      stats: {
        maxHp: 64,
        damage: 1,
        speed: 80,
        takeDamageMod: 1,
        attackRange: 2000,
        visionRange: 1000,
        ammoMax: 1,
      },
      abilities: [],
    })
  }

}

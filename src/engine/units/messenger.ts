import {type unitstate, unitType} from './types'
import { GenericUnit } from "@/engine/units/genericUnit.ts";

export class Messenger extends GenericUnit {
  type: unitType = unitType.MESSENGER

  constructor(s: unitstate) {
    super(s, {
      stats: {
        maxHp: 1,
        damage: 0.01,
        speed: 400,
        takeDamageMod: 1,
        attackRange: 2000,
        visionRange: 1000,
        ammoMax: 1,
      },
      abilities: [],
    })
  }
}

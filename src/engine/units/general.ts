import type {UnitStats} from './baseUnit'
import {BaseUnit} from './baseUnit'
import {type unitstate, unitType} from './types'
import type {vec2} from "@/engine";
import {Team} from "@/enums/teamKeys.ts";
import {RoomGameStage} from "@/enums/roomStage.ts";

export class General extends BaseUnit {
  type: unitType = unitType.GENERAL

  stats: UnitStats = {
    maxHp: 64,
    damage: 1,
    speed: 80,
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

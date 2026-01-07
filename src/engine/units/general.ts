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
    damage: 10,
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

  override move(to: vec2) {
    if (window.PLAYER.team !== Team.ADMIN && window.ROOM_WORLD.stage !== RoomGameStage.PLANNING) {
      return
    }
    super.move(to)
  }
}

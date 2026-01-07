import {type unitstate, unitType} from './types'
import {Infantry} from './infantry'
import {Cavalry} from './cavalry'
import {Artillery} from './artillery'
import {Marine} from './marine'
import {Militia} from './militia'
import type {BaseUnit} from './baseUnit'
import {Gatling} from "@/engine/units/gatling.ts";
import {General} from "@/engine/units/general.ts";
import {Messenger} from "@/engine/units/messenger.ts";

export function createUnit(state: unitstate): BaseUnit {
  switch (state.type) {
    case unitType.INFANTRY:
      return new Infantry(state)
    case unitType.CAVALRY:
      return new Cavalry(state)
    case unitType.ARTILLERY:
      return new Artillery(state)
    case unitType.MARINE:
      return new Marine(state)
    case unitType.MILITIA:
      return new Militia(state)
    case unitType.GATLING:
      return new Gatling(state)
    case unitType.GENERAL:
      return new General(state)
    case unitType.MESSENGER:
      return new Messenger(state)
    default:
      throw new Error(`Unknown unit type: ${state.type}`)
  }
}

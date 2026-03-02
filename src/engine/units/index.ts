import {type unitstate, unitType} from './types'
import type {BaseUnit} from './baseUnit'
import {General} from "@/engine/units/general.ts";
import {Messenger} from "@/engine/units/messenger.ts";
import { GenericUnit } from "@/engine/units/genericUnit.ts";

export function createUnit(state: unitstate): BaseUnit {
  // Keep these as baseline hardcoded units.
  if (state.type === unitType.GENERAL) return new General(state)
  if (state.type === unitType.MESSENGER) return new Messenger(state)

  // Everything else comes from resourcepack.
  return new GenericUnit(state)
}

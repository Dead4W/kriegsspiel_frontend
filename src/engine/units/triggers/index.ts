import { AtGameTimeTrigger } from "./atGameTimeTrigger.ts";
import { OnAttackedTrigger } from "./onAttackedTrigger.ts";
import { OnEnemyTrigger } from "./onEnemyTrigger.ts";
import { PeriodicTrigger } from "./periodicTrigger.ts";
import type { BaseTrigger } from "./baseTrigger.ts";
import {
  normalizeUnitTriggerStates,
  type UnitTriggerState,
} from "./types.ts";
import { UnitTriggerTypes } from "./UnitTriggerTypes.ts";
import type { unitstate } from "@/engine/units/types.ts";

export { BaseTrigger } from "./baseTrigger.ts";
export { AtGameTimeTrigger } from "./atGameTimeTrigger.ts";
export { PeriodicTrigger } from "./periodicTrigger.ts";
export { OnEnemyTrigger } from "./onEnemyTrigger.ts";
export { OnAttackedTrigger } from "./onAttackedTrigger.ts";
export { UnitTriggerTypes, type UnitTriggerType } from "./UnitTriggerTypes.ts";
export {
  normalizeUnitTriggerState,
  normalizeUnitTriggerStates,
  unitHasTrigger,
  type AtGameTimeTriggerState,
  type OnAttackedTriggerState,
  type OnEnemyTriggerState,
  type PeriodicTriggerState,
  type TriggerAttackDamage,
  type TriggerContext,
  type TriggerEventPayload,
  type UnitAiTriggerState,
  type UnitTriggerState,
} from "./types.ts";
export function createUnitTrigger(state: UnitTriggerState): BaseTrigger {
  switch (state.type) {
    case UnitTriggerTypes.AtGameTime:
      return new AtGameTimeTrigger(state);
    case UnitTriggerTypes.Periodic:
      return new PeriodicTrigger(state);
    case UnitTriggerTypes.OnEnemy:
      return new OnEnemyTrigger(state);
    case UnitTriggerTypes.OnAttacked:
      return new OnAttackedTrigger(state);
  }
}

export function createUnitTriggers(raw: unknown, sourceMessageId: string | null = null): BaseTrigger[] {
  return normalizeUnitTriggerStates(raw, sourceMessageId).map(createUnitTrigger);
}

export function readUnitTriggerStates(state: Pick<unitstate, "triggers" | "aiTriggers" | "periodicBatch">): UnitTriggerState[] {
  const triggers = normalizeUnitTriggerStates(state.triggers ?? state.aiTriggers ?? []);
  if (
    state.periodicBatch
    && !triggers.some((trigger) => trigger.type === UnitTriggerTypes.Periodic)
  ) {
    triggers.push({ type: UnitTriggerTypes.Periodic });
  }
  return triggers;
}

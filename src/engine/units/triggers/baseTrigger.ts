import type { TriggerContext, TriggerEventPayload, UnitTriggerState } from "./types.ts";
import type { UnitTriggerType } from "./UnitTriggerTypes.ts";

export abstract class BaseTrigger<
  TType extends UnitTriggerType = UnitTriggerType,
  TState extends UnitTriggerState = UnitTriggerState,
> {
  abstract readonly type: TType;

  abstract getState(): TState;

  abstract evaluate(ctx: TriggerContext): TriggerEventPayload | null;

  markFired(): void {}
}

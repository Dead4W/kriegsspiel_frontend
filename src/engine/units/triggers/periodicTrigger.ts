import { BaseTrigger } from "./baseTrigger.ts";
import type { PeriodicTriggerState, TriggerContext, TriggerEventPayload } from "./types.ts";
import { UnitTriggerTypes } from "./UnitTriggerTypes.ts";

export class PeriodicTrigger extends BaseTrigger<
  typeof UnitTriggerTypes.Periodic,
  PeriodicTriggerState
> {
  readonly type = UnitTriggerTypes.Periodic;

  constructor(private state: PeriodicTriggerState) {
    super();
  }

  getState(): PeriodicTriggerState {
    return { ...this.state };
  }

  evaluate(_ctx: TriggerContext): TriggerEventPayload | null {
    return null;
  }
}

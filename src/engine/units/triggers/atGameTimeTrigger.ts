import { BaseTrigger } from "./baseTrigger.ts";
import type { AtGameTimeTriggerState, TriggerContext, TriggerEventPayload } from "./types.ts";
import { UnitTriggerTypes } from "./UnitTriggerTypes.ts";

export class AtGameTimeTrigger extends BaseTrigger<
  typeof UnitTriggerTypes.AtGameTime,
  AtGameTimeTriggerState
> {
  readonly type = UnitTriggerTypes.AtGameTime;

  constructor(private state: AtGameTimeTriggerState) {
    super();
  }

  getState(): AtGameTimeTriggerState {
    return { ...this.state };
  }

  evaluate(ctx: TriggerContext): TriggerEventPayload | null {
    if (this.state.fired) return null;
    const targetGameTimeMs = Date.parse(String(this.state.atGameTime).replace(" ", "T"));
    if (!Number.isFinite(ctx.currentGameTimeMs) || !Number.isFinite(targetGameTimeMs)) return null;
    if (ctx.currentGameTimeMs < targetGameTimeMs) return null;
    return {
      unitId: ctx.unit.id,
      triggerType: this.type,
      sourceMessageId: this.state.sourceMessageId ?? ctx.sourceMessageId,
      details: {
        atGameTime: this.state.atGameTime,
        currentGameTime: ctx.currentGameTime,
      },
    };
  }

  markFired(): void {
    this.state = { ...this.state, fired: true };
  }
}

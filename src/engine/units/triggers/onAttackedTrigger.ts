import { BaseTrigger } from "./baseTrigger.ts";
import type { OnAttackedTriggerState, TriggerContext, TriggerEventPayload } from "./types.ts";
import { UnitTriggerTypes } from "./UnitTriggerTypes.ts";

export class OnAttackedTrigger extends BaseTrigger<
  typeof UnitTriggerTypes.OnAttacked,
  OnAttackedTriggerState
> {
  readonly type = UnitTriggerTypes.OnAttacked;

  constructor(private state: OnAttackedTriggerState) {
    super();
  }

  getState(): OnAttackedTriggerState {
    return { ...this.state };
  }

  evaluate(ctx: TriggerContext): TriggerEventPayload | null {
    if (!ctx.attackDamage) return null;
    return {
      unitId: ctx.unit.id,
      triggerType: this.type,
      sourceMessageId: this.state.sourceMessageId ?? ctx.sourceMessageId,
      details: {
        hpBefore: ctx.attackDamage.hpBefore,
        hpAfter: ctx.attackDamage.hpAfter,
        attackerIds: [...ctx.attackDamage.attackerIds],
      },
    };
  }
}

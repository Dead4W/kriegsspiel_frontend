import { BaseTrigger } from "./baseTrigger.ts";
import type { OnEnemyTriggerState, TriggerContext, TriggerEventPayload } from "./types.ts";
import { UnitTriggerTypes } from "./UnitTriggerTypes.ts";

export class OnEnemyTrigger extends BaseTrigger<
  typeof UnitTriggerTypes.OnEnemy,
  OnEnemyTriggerState
> {
  readonly type = UnitTriggerTypes.OnEnemy;

  constructor(private state: OnEnemyTriggerState) {
    super();
  }

  getState(): OnEnemyTriggerState {
    return { ...this.state };
  }

  evaluate(ctx: TriggerContext): TriggerEventPayload | null {
    if (!ctx.newlyVisibleEnemies.length) return null;
    return {
      unitId: ctx.unit.id,
      triggerType: this.type,
      sourceMessageId: this.state.sourceMessageId ?? ctx.sourceMessageId,
      details: {
        enemyIds: ctx.newlyVisibleEnemies.map((enemy) => enemy.id),
        directEnemyCount: ctx.visibleEnemies.length,
      },
    };
  }
}

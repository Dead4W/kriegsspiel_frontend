import { describe, expect, it } from "vitest";
import {
  createUnitTrigger,
  createUnitTriggers,
  normalizeUnitTriggerState,
  readUnitTriggerStates,
  UnitTriggerTypes,
} from "@/engine/units/triggers";
import type { TriggerContext } from "@/engine/units/triggers";

function ctx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    world: {} as TriggerContext["world"],
    unit: { id: "line" } as TriggerContext["unit"],
    currentGameTime: "1882-06-12 10:00:00",
    currentGameTimeMs: Date.parse("1882-06-12T10:00:00"),
    sourceMessageId: "order-1",
    attackDamage: null,
    visibleEnemies: [],
    newlyVisibleEnemies: [],
    ...overrides,
  };
}

describe("unit trigger factory", () => {
  it("normalizes every supported type and drops unknown ones", () => {
    expect(normalizeUnitTriggerState({ type: "on_enemy_seen" })).toEqual({
      type: UnitTriggerTypes.OnEnemy,
      sourceMessageId: null,
    });
    expect(normalizeUnitTriggerState({ type: "on_attacked" })?.type).toBe(UnitTriggerTypes.OnAttacked);
    expect(normalizeUnitTriggerState({ type: "periodic" })?.type).toBe(UnitTriggerTypes.Periodic);
    expect(normalizeUnitTriggerState({ type: "at_game_time", atGameTime: "nope" })).toBeNull();
    expect(normalizeUnitTriggerState({ type: "unknown" })).toBeNull();
  });

  it("reads legacy aiTriggers and periodicBatch into one list", () => {
    expect(readUnitTriggerStates({
      aiTriggers: [{ type: "at_game_time", atGameTime: "1882-06-12 11:00:00" }],
      periodicBatch: true,
    })).toEqual([
      {
        type: UnitTriggerTypes.AtGameTime,
        atGameTime: "1882-06-12 11:00:00",
        sourceMessageId: null,
        fired: false,
      },
      { type: UnitTriggerTypes.Periodic },
    ]);
  });

  it("builds one object per trigger type", () => {
    const triggers = createUnitTriggers([
      { type: "on_enemy" },
      { type: "on_attacked" },
      { type: "periodic" },
      { type: "at_game_time", atGameTime: "1882-06-12 11:00:00" },
    ]);
    expect(triggers.map((trigger) => trigger.type)).toEqual([
      UnitTriggerTypes.OnEnemy,
      UnitTriggerTypes.OnAttacked,
      UnitTriggerTypes.Periodic,
      UnitTriggerTypes.AtGameTime,
    ]);
  });
});

describe("unit trigger evaluate", () => {
  it("fires on_enemy only for newly visible enemies", () => {
    const trigger = createUnitTrigger({ type: UnitTriggerTypes.OnEnemy });
    expect(trigger.evaluate(ctx())).toBeNull();
    expect(trigger.evaluate(ctx({
      newlyVisibleEnemies: [{ id: "enemy-1" } as TriggerContext["unit"]],
      visibleEnemies: [{ id: "enemy-1" } as TriggerContext["unit"]],
    }))).toMatchObject({
      triggerType: UnitTriggerTypes.OnEnemy,
      details: { enemyIds: ["enemy-1"], directEnemyCount: 1 },
    });
  });

  it("fires on_attacked only when damage is pending", () => {
    const trigger = createUnitTrigger({ type: UnitTriggerTypes.OnAttacked });
    expect(trigger.evaluate(ctx())).toBeNull();
    expect(trigger.evaluate(ctx({
      attackDamage: { hpBefore: 40, hpAfter: 32, attackerIds: ["gun"] },
    }))).toMatchObject({
      triggerType: UnitTriggerTypes.OnAttacked,
      details: { hpBefore: 40, hpAfter: 32, attackerIds: ["gun"] },
    });
  });

  it("fires at_game_time once and then stays silent", () => {
    const trigger = createUnitTrigger({
      type: UnitTriggerTypes.AtGameTime,
      atGameTime: "1882-06-12 10:00:00",
    });
    expect(trigger.evaluate(ctx({
      currentGameTime: "1882-06-12 09:59:00",
      currentGameTimeMs: Date.parse("1882-06-12T09:59:00"),
    }))).toBeNull();
    expect(trigger.evaluate(ctx())?.triggerType).toBe(UnitTriggerTypes.AtGameTime);
    trigger.markFired();
    expect(trigger.evaluate(ctx())).toBeNull();
    expect(trigger.getState().fired).toBe(true);
  });

  it("keeps periodic as a standing flag and does not emit from evaluate", () => {
    const trigger = createUnitTrigger({ type: UnitTriggerTypes.Periodic });
    expect(trigger.evaluate(ctx())).toBeNull();
    expect(trigger.getState()).toEqual({ type: UnitTriggerTypes.Periodic });
  });
});

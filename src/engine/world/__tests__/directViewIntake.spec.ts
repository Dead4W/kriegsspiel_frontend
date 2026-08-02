// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { describe, expect, it } from "vitest";
import type { BaseUnit } from "@/engine/units/baseUnit";
import type { world } from "@/engine/world/world";
import { Team } from "@/enums/teamKeys";
import { unitType } from "@/engine/units/types";
import { releaseDirectViewContacts } from "@/engine/world/directViewIntake";

type FakeUnit = BaseUnit & { commands: unknown[]; futurePos: unknown };

function createUnit(id: string, overrides: Partial<FakeUnit> = {}): FakeUnit {
  return {
    id,
    team: Team.RED,
    type: unitType.INFANTRY,
    directView: true,
    isDirectChain: false,
    commands: [{ type: "move" }],
    futurePos: { x: 5, y: 5 },
    ...overrides,
  } as unknown as FakeUnit;
}

function createWorld(units: FakeUnit[]) {
  const removed: string[] = [];
  const synced: string[] = [];
  const roomWorld = {
    units: {
      list: () => units.filter((unit) => !removed.includes(unit.id)),
      remove: (id: string) => removed.push(id),
      markSynced: (unit: FakeUnit) => synced.push(unit.id),
    },
  };
  return { world: roomWorld as unknown as world, removed, synced };
}

describe("a rendered client, which draws only what it can see", () => {
  it("drops an enemy that left view", () => {
    const enemy = createUnit("enemy", { team: Team.BLUE });
    const { world: roomWorld, removed } = createWorld([enemy]);

    releaseDirectViewContacts({
      world: roomWorld,
      playerTeam: Team.RED,
      preserveLostContacts: false,
    });

    expect(removed).toEqual(["enemy"]);
  });

  it("drops its own courier too, since it is drawn from the packet", () => {
    const messenger = createUnit("courier", { type: unitType.MESSENGER });
    const { world: roomWorld, removed } = createWorld([messenger]);

    releaseDirectViewContacts({
      world: roomWorld,
      playerTeam: Team.RED,
      preserveLostContacts: false,
    });

    expect(removed).toEqual(["courier"]);
  });

  it("keeps its own units but stops claiming to know their orders", () => {
    const own = createUnit("own");
    const { world: roomWorld, removed, synced } = createWorld([own]);

    releaseDirectViewContacts({
      world: roomWorld,
      playerTeam: Team.RED,
      preserveLostContacts: false,
    });

    expect(removed).toEqual([]);
    expect(own.commands).toEqual([]);
    expect(own.futurePos).toBeNull();
    expect(own.directView).toBe(false);
    expect(own.isDirectChain).toBe(false);
    expect(synced).toEqual(["own"]);
  });
});

describe("a client keeping its own map", () => {
  it("keeps an enemy that left view as a last-known position", () => {
    const enemy = createUnit("enemy", { team: Team.BLUE, isDirectChain: true });
    const { world: roomWorld, removed, synced } = createWorld([enemy]);

    releaseDirectViewContacts({
      world: roomWorld,
      playerTeam: Team.RED,
      preserveLostContacts: true,
    });

    expect(removed).toEqual([]);
    expect(enemy.directView).toBe(false);
    expect(enemy.isDirectChain).toBe(false);
    expect(synced).toEqual(["enemy"]);
  });

  it("keeps the orders of its own units, which it wrote and can carry forward", () => {
    const own = createUnit("own");
    const { world: roomWorld } = createWorld([own]);

    releaseDirectViewContacts({
      world: roomWorld,
      playerTeam: Team.RED,
      preserveLostContacts: true,
    });

    expect(own.commands).toEqual([{ type: "move" }]);
    expect(own.futurePos).toEqual({ x: 5, y: 5 });
    expect(own.directView).toBe(false);
  });

  it("keeps a courier in flight", () => {
    const messenger = createUnit("courier", { type: unitType.MESSENGER });
    const { world: roomWorld, removed } = createWorld([messenger]);

    releaseDirectViewContacts({
      world: roomWorld,
      playerTeam: Team.RED,
      preserveLostContacts: true,
    });

    expect(removed).toEqual([]);
  });
});

it("leaves units that were already out of view untouched", () => {
  const stale = createUnit("stale", { directView: false });
  const { world: roomWorld, removed, synced } = createWorld([stale]);

  releaseDirectViewContacts({
    world: roomWorld,
    playerTeam: Team.RED,
    preserveLostContacts: false,
  });

  expect(removed).toEqual([]);
  expect(synced).toEqual([]);
  expect(stale.commands).toEqual([{ type: "move" }]);
});

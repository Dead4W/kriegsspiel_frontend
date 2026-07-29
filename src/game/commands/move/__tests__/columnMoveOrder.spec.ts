// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { beforeEach, describe, expect, it } from "vitest";
import type { commandstate } from "@/engine";
import type { vec2 } from "@/engine/types";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import { BaseUnit } from "@/engine/units/baseUnit";
import type { BaseCommand } from "@/engine/units/commands/baseCommand";
import { createUnitCommand } from "@/engine/units/commands";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import { applyMoveOrder } from "@/game/commands/move/applyMoveOrder";
import { buildMovePlan } from "@/game/commands/move/movePlan";

type AnyCommand = BaseCommand<UnitCommandTypes, unknown>;

function createUnit(id: string, x: number, y: number): BaseUnit {
  const commands: AnyCommand[] = [];
  const unit = {
    id,
    pos: { x, y },
    team: Team.RED,
    type: "infantry",
    directView: false,
    isRetreat: false,
    manualEnvironment: null,
    getCommands: () => commands,
    setCommands: (next: AnyCommand[]) => {
      commands.length = 0;
      commands.push(...next);
    },
    addCommand: (state: commandstate) => {
      commands.push(createUnitCommand(state) as AnyCommand);
    },
    setDirty: () => {},
  };
  return unit as unknown as BaseUnit;
}

function moveStates(unit: BaseUnit): MoveCommandState[] {
  return unit
    .getCommands()
    .filter((command) => command.type === UnitCommandTypes.Move)
    .map((command) => (command as MoveCommand).getState().state);
}

function orderIndexOf(unit: BaseUnit): number {
  const states = moveStates(unit);
  expect(states.length).toBeGreaterThan(0);
  return states[0]!.orderIndex;
}

function finalTargetOf(unit: BaseUnit): vec2 {
  const states = moveStates(unit);
  expect(states.length).toBeGreaterThan(0);
  return states[states.length - 1]!.target;
}

/** Unit ids sorted from the tail of the column to its head. */
function arrangementAlong(units: BaseUnit[], direction: vec2): string[] {
  const length = Math.hypot(direction.x, direction.y);
  const dir = { x: direction.x / length, y: direction.y / length };
  return [...units]
    .map((unit) => ({ id: unit.id, pos: finalTargetOf(unit) }))
    .sort((a, b) => (a.pos.x * dir.x + a.pos.y * dir.y) - (b.pos.x * dir.x + b.pos.y * dir.y))
    .map((item) => item.id);
}

function orderColumnMove(units: BaseUnit[], targets: vec2[]): void {
  applyMoveOrder({
    movingUnits: units,
    routeTargets: targets.map((pos) => ({ pos, modifier: null })),
    plan: buildMovePlan(units, targets[0]!),
    formationCenter: null,
    formationOffsets: {},
    moveMode: "column",
    smartPathEnabled: false,
    hasObjectMap: false,
    selectedAbilities: [],
    isPatrol: false,
    createUniqueId: () => "test-order",
    roomWorld: window.ROOM_WORLD,
    emitDirectViewOrder: () => {},
    playerTeam: Team.ADMIN,
    metersPerPixel: 1,
  });
}

beforeEach(() => {
  window.ROOM_PARAMS = {};
  window.ROOM_SETTINGS = {};
  window.PLAYER = { name: "admin", team: Team.ADMIN };
  window.ROOM_WORLD = {
    stage: RoomGameStage.WAR,
    hasObjectNavMeshMap: () => false,
  } as unknown as typeof window.ROOM_WORLD;
});

describe("column move order", () => {
  it("gives the lead order index to the unit nearest to the target", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    orderColumnMove(units, [{ x: 0, y: 600 }]);

    expect(units.map(orderIndexOf)).toEqual([2, 1, 0]);
  });

  it("keeps 1 2 3 arranged as 1 2 3 when moving horizontally", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 30, 0), createUnit("3", 60, 0)];

    orderColumnMove(units, [{ x: 600, y: 0 }]);

    expect(arrangementAlong(units, { x: 1, y: 0 })).toEqual(["1", "2", "3"]);
  });

  it("keeps 1 2 3 arranged as 1 2 3 when moving vertically", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    orderColumnMove(units, [{ x: 0, y: 600 }]);

    expect(arrangementAlong(units, { x: 0, y: 1 })).toEqual(["1", "2", "3"]);
  });

  it("keeps 1 2 3 arranged as 1 2 3 when moving diagonally", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 30, 30), createUnit("3", 60, 60)];

    orderColumnMove(units, [{ x: 600, y: 600 }]);

    expect(arrangementAlong(units, { x: 1, y: 1 })).toEqual(["1", "2", "3"]);
  });

  it("folds a sideways line into 1 5 2 4 3 with the middle unit in front", () => {
    const units = [
      createUnit("1", 0, 0),
      createUnit("2", 0, 30),
      createUnit("3", 0, 60),
      createUnit("4", 0, 90),
      createUnit("5", 0, 120),
    ];

    orderColumnMove(units, [{ x: 600, y: 60 }]);
    const arrangement = arrangementAlong(units, { x: 1, y: 0 });

    expect(arrangement[4]).toBe("3");
    expect([arrangement[2], arrangement[3]].sort()).toEqual(["2", "4"]);
    expect([arrangement[0], arrangement[1]].sort()).toEqual(["1", "5"]);
  });

  it("does not depend on the order units were selected in", () => {
    const target = { x: 0, y: 600 };
    const inOrder = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];
    const reversed = [createUnit("3", 0, 60), createUnit("2", 0, 30), createUnit("1", 0, 0)];

    orderColumnMove(inOrder, [target]);
    orderColumnMove(reversed, [target]);

    expect(arrangementAlong(inOrder, { x: 0, y: 1 })).toEqual(
      arrangementAlong(reversed, { x: 0, y: 1 })
    );
  });

  it("never sends a unit away from the target on the first leg", () => {
    const target = { x: 600, y: 60 };
    const units = [
      createUnit("1", 0, 0),
      createUnit("2", 0, 30),
      createUnit("3", 0, 60),
      createUnit("4", 0, 90),
      createUnit("5", 0, 120),
    ];

    orderColumnMove(units, [target]);

    for (const unit of units) {
      let from: vec2 = unit.pos;
      for (const state of moveStates(unit)) {
        expect(Math.hypot(state.target.x - target.x, state.target.y - target.y)).toBeLessThanOrEqual(
          Math.hypot(from.x - target.x, from.y - target.y) + 1e-6
        );
        from = state.target;
      }
    }
  });

  it("rebuilds the leader when a marching column is turned back", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    orderColumnMove(units, [{ x: 0, y: 600 }]);
    expect(orderIndexOf(units[2]!)).toBe(0);

    // Same group, but now ordered back to where it came from: the unit that is
    // closest to the new target has to lead, whatever the previous column was.
    orderColumnMove(units, [{ x: 0, y: -600 }]);

    const lastOrders = units.map((unit) => moveStates(unit).at(-1)!);
    expect(lastOrders.map((state) => state.orderIndex)).toEqual([0, 1, 2]);
  });

  it("keeps the marching order when the column continues forward", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    orderColumnMove(units, [{ x: 0, y: 600 }]);
    orderColumnMove(units, [{ x: 0, y: 1200 }]);

    const lastOrders = units.map((unit) => moveStates(unit).at(-1)!);
    expect(lastOrders.map((state) => state.orderIndex)).toEqual([2, 1, 0]);
  });
});

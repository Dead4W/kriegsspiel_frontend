// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { commandstate } from "@/engine";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import type { BaseUnit } from "@/engine/units/baseUnit";
import type { BaseCommand } from "@/engine/units/commands/baseCommand";
import type { ChatMessage } from "@/engine/types/chatMessage";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import { createUnitCommand } from "@/engine/units/commands";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath";
import {
  applyOrderPlanToUnit,
  applyOrderPlans,
  toOrderCommandObjects,
} from "@/engine/units/orderApply";
import type { MoveCommandState } from "@/engine/units/commands/moveCommand";

vi.mock("@/engine/world/roadPath", () => ({
  buildRoadTurnRoutePoints: vi.fn(() => []),
}));

const roadRoute = vi.mocked(buildRoadTurnRoutePoints);

type AnyCommand = BaseCommand<UnitCommandTypes, unknown>;

function createUnit(id: string, overrides: Partial<BaseUnit> = {}): BaseUnit {
  const commands: AnyCommand[] = [];
  const unit = {
    id,
    pos: { x: 0, y: 0 },
    team: Team.RED,
    type: "infantry",
    alive: true,
    isRetreat: false,
    manualEnvironment: { some: "value" },
    dirty: false,
    getCommands: () => commands,
    setCommands: (next: AnyCommand[]) => {
      commands.length = 0;
      commands.push(...next);
    },
    addCommand: (state: commandstate) => {
      commands.push(createUnitCommand(state) as AnyCommand);
    },
    setDirty: () => {
      (unit as { dirty: boolean }).dirty = true;
    },
    setAutoAttack: () => {},
    setAiTriggers: () => {},
    ...overrides,
  };
  return unit as unknown as BaseUnit;
}

function moveTo(x: number, y: number): commandstate {
  return {
    type: UnitCommandTypes.Move,
    status: "pending",
    state: {
      target: { x, y },
      modifier: null,
      abilities: [],
      orderIndex: 3,
      uniqueId: "order-1",
      isPatrol: false,
    },
  } as commandstate;
}

function changeFormationTo(newFormation: string): commandstate {
  return {
    type: UnitCommandTypes.ChangeFormation,
    status: "pending",
    state: { newFormation, elapsed: 0 },
  } as unknown as commandstate;
}

function followUnit(targetId: string): commandstate {
  return {
    type: UnitCommandTypes.Follow,
    status: "pending",
    state: { targets: [targetId], distanceMeters: 50 },
  } as unknown as commandstate;
}

function waitFor(ms: number): commandstate {
  return {
    type: UnitCommandTypes.Wait,
    status: "pending",
    state: { wait: ms, elapsed: 0 },
  } as unknown as commandstate;
}

function retreat(): commandstate {
  return {
    type: UnitCommandTypes.Retreat,
    status: "pending",
    state: { elapsed: 0, duration: 60000 },
  } as unknown as commandstate;
}

function message(): ChatMessage {
  return { id: "message-1", author_team: Team.RED } as ChatMessage;
}

function commandTypes(unit: BaseUnit): string[] {
  return unit.getCommands().map((command) => command.type);
}

const units = new Map<string, BaseUnit>();

beforeEach(() => {
  units.clear();
  roadRoute.mockReset();
  roadRoute.mockReturnValue([]);
  window.ROOM_PARAMS = {};
  window.ROOM_SETTINGS = {};
  window.PLAYER = { name: "red", team: Team.RED };
  window.ROOM_WORLD = {
    stage: RoomGameStage.WAR,
    time: "1882-06-12 09:00:00",
    hasObjectNavMeshMap: () => false,
    units: {
      get: (id: string) => units.get(id) ?? null,
      withNewCommandsTmp: new Set<string>(),
    },
  } as unknown as typeof window.ROOM_WORLD;
});

describe("order command building", () => {
  it("builds every command type the engine can run", () => {
    const built = toOrderCommandObjects([
      moveTo(10, 10),
      { type: UnitCommandTypes.Attack, status: "pending", state: { targets: ["enemy"], damageModifier: 1, abilities: [], inaccuracyPoint: null } },
      waitFor(60000),
      retreat(),
      changeFormationTo("line"),
      followUnit("unit-b"),
    ] as commandstate[]);

    expect(built.map((command) => command.type)).toEqual([
      UnitCommandTypes.Move,
      UnitCommandTypes.Attack,
      UnitCommandTypes.Wait,
      UnitCommandTypes.Retreat,
      UnitCommandTypes.ChangeFormation,
      UnitCommandTypes.Follow,
    ]);
  });

  it("skips entries that are not command states instead of throwing", () => {
    const built = toOrderCommandObjects([
      null,
      "move",
      { type: UnitCommandTypes.Move },
      { type: "nonsense", state: {} },
      moveTo(1, 1),
    ] as unknown[]);

    expect(built.map((command) => command.type)).toEqual([UnitCommandTypes.Move]);
  });
});

describe("applying a plan to a unit", () => {
  it("carries a formation change through, which the free channel cannot", () => {
    const unit = createUnit("unit-a");

    const applied = applyOrderPlanToUnit(
      message(),
      { unitId: "unit-a", commands: [changeFormationTo("line"), moveTo(10, 10)] },
      unit,
    );

    expect(applied).toBe(true);
    expect(commandTypes(unit)).toEqual([
      UnitCommandTypes.ChangeFormation,
      UnitCommandTypes.Move,
    ]);
  });

  it("replaces the queue and drops any manual environment", () => {
    const unit = createUnit("unit-a");
    unit.addCommand(waitFor(1000));

    applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [moveTo(5, 5)] }, unit);

    expect(commandTypes(unit)).toEqual([UnitCommandTypes.Move]);
    expect(unit.manualEnvironment).toBeNull();
  });

  it("keeps a retreat when the caller asks for it", () => {
    const unit = createUnit("unit-a");
    unit.addCommand(retreat());
    unit.addCommand(waitFor(1000));

    applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [moveTo(5, 5)] }, unit, {
      preserveCommandTypes: [UnitCommandTypes.Retreat],
    });

    expect(commandTypes(unit)).toEqual([UnitCommandTypes.Retreat, UnitCommandTypes.Move]);
  });

  it("leaves the queue alone for an empty plan unless clearing was asked for", () => {
    const unit = createUnit("unit-a");
    unit.addCommand(waitFor(1000));

    expect(applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [] }, unit)).toBe(false);
    expect(commandTypes(unit)).toEqual([UnitCommandTypes.Wait]);

    expect(
      applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [] }, unit, {
        clearCommandsWhenEmpty: true,
      }),
    ).toBe(true);
    expect(commandTypes(unit)).toEqual([]);
  });

  it("counts as applied when the caller acts on the plan itself", () => {
    const unit = createUnit("unit-a");

    expect(
      applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [] }, unit, {
        hasExternalEffects: true,
      }),
    ).toBe(true);
  });

  it("skips a dead or retreating unit when asked to", () => {
    const dead = createUnit("dead", { alive: false });
    const running = createUnit("running", { isRetreat: true });

    for (const unit of [dead, running]) {
      expect(
        applyOrderPlanToUnit(message(), { unitId: unit.id, commands: [moveTo(1, 1)] }, unit, {
          skipUnavailableUnits: true,
        }),
      ).toBe(false);
      expect(commandTypes(unit)).toEqual([]);
    }
  });

  it("sets on-unit state from the structured field", () => {
    const autoAttack: boolean[] = [];
    const triggers: unknown[][] = [];
    const unit = createUnit("unit-a", {
      setAutoAttack: (value: boolean) => autoAttack.push(value),
      setAiTriggers: (next: unknown[]) => triggers.push(next),
    } as unknown as Partial<BaseUnit>);

    const applied = applyOrderPlanToUnit(
      message(),
      {
        unitId: "unit-a",
        commands: [],
        state: {
          autoAttack: true,
          triggers: [{ type: "at_game_time", atGameTime: "1882-06-12 11:00:00" }],
        },
      },
      unit,
    );

    expect(applied).toBe(true);
    expect(autoAttack).toEqual([true]);
    expect(triggers).toEqual([[{
      type: "at_game_time",
      atGameTime: "1882-06-12 11:00:00",
      sourceMessageId: "message-1",
      fired: false,
    }]]);
  });

  it("prefers the structured field over a note saying otherwise", () => {
    // Notes stay readable so orders written before the field existed keep
    // working, but an author that states both meant the structured one.
    const autoAttack: boolean[] = [];
    const unit = createUnit("unit-a", {
      setAutoAttack: (value: boolean) => autoAttack.push(value),
    } as unknown as Partial<BaseUnit>);

    applyOrderPlanToUnit(
      message(),
      { unitId: "unit-a", commands: [], notes: ["set_autoattack:on"], state: { autoAttack: false } },
      unit,
    );

    expect(autoAttack).toEqual([false]);
  });

  it("still reads a note when the structured field says nothing", () => {
    const autoAttack: boolean[] = [];
    const unit = createUnit("unit-a", {
      setAutoAttack: (value: boolean) => autoAttack.push(value),
    } as unknown as Partial<BaseUnit>);

    applyOrderPlanToUnit(
      message(),
      { unitId: "unit-a", commands: [], notes: ["set_autoattack:on"], state: {} },
      unit,
    );

    expect(autoAttack).toEqual([true]);
  });

  it("marks the unit for sync only when asked to", () => {
    const quiet = createUnit("quiet");
    applyOrderPlanToUnit(message(), { unitId: "quiet", commands: [moveTo(1, 1)] }, quiet);
    expect((quiet as unknown as { dirty: boolean }).dirty).toBe(false);

    const synced = createUnit("synced");
    applyOrderPlanToUnit(message(), { unitId: "synced", commands: [moveTo(1, 1)] }, synced, {
      markDirty: true,
    });
    expect((synced as unknown as { dirty: boolean }).dirty).toBe(true);
    expect(window.ROOM_WORLD.units.withNewCommandsTmp.has("synced")).toBe(true);
  });
});

describe("road rebuild", () => {
  function withRoads(route: Array<{ x: number; y: number }>) {
    roadRoute.mockReturnValue(route);
    window.ROOM_WORLD = {
      ...window.ROOM_WORLD,
      hasObjectNavMeshMap: () => true,
    } as unknown as typeof window.ROOM_WORLD;
  }

  function moveStates(unit: BaseUnit): MoveCommandState[] {
    return unit
      .getCommands()
      .filter((command) => command.type === UnitCommandTypes.Move)
      .map((command) => (command.getState() as { state: MoveCommandState }).state);
  }

  it("expands one waypoint into the segments the unit will walk", () => {
    withRoads([{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 10, y: 10 }]);
    const unit = createUnit("unit-a");

    applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [moveTo(10, 10)] }, unit);

    expect(moveStates(unit).map((state) => state.target)).toEqual([
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("keeps the unit's place in the column and numbers the segments separately", () => {
    withRoads([{ x: 4, y: 0 }, { x: 10, y: 10 }]);
    const unit = createUnit("unit-a");

    applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [moveTo(10, 10)] }, unit);

    const states = moveStates(unit);
    expect(states.map((state) => state.orderIndex)).toEqual([3, 3]);
    expect(states.map((state) => state.segIndex)).toEqual([0, 1]);
  });

  it("leaves a move alone when it asks to ignore roads", () => {
    withRoads([{ x: 4, y: 0 }, { x: 10, y: 10 }]);
    const unit = createUnit("unit-a");
    const command = moveTo(10, 10) as { state: Record<string, unknown> };
    command.state.ignoreRoads = true;

    applyOrderPlanToUnit(
      message(),
      { unitId: "unit-a", commands: [command as unknown as commandstate] },
      unit,
    );

    expect(moveStates(unit).map((state) => state.target)).toEqual([{ x: 10, y: 10 }]);
    expect(roadRoute).not.toHaveBeenCalled();
  });

  it("keeps the original waypoint when no road route is found", () => {
    withRoads([]);
    const unit = createUnit("unit-a");

    applyOrderPlanToUnit(message(), { unitId: "unit-a", commands: [moveTo(10, 10)] }, unit);

    expect(moveStates(unit).map((state) => state.target)).toEqual([{ x: 10, y: 10 }]);
  });
});

describe("applying a set of plans", () => {
  it("counts the units that took an order and ignores unknown ones", () => {
    const first = createUnit("unit-a");
    const second = createUnit("unit-b");
    units.set(first.id, first);
    units.set(second.id, second);

    const applied = applyOrderPlans(message(), [
      { unitId: "unit-a", commands: [moveTo(1, 1)] },
      { unitId: "unit-b", commands: [changeFormationTo("line")] },
      { unitId: "unit-gone", commands: [moveTo(2, 2)] },
    ]);

    expect(applied).toBe(2);
    expect(commandTypes(second)).toEqual([UnitCommandTypes.ChangeFormation]);
  });
});

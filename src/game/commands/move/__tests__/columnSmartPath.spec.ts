// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { commandstate } from "@/engine";
import type { vec2 } from "@/engine/types";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import type { BaseUnit } from "@/engine/units/baseUnit";
import type { BaseCommand } from "@/engine/units/commands/baseCommand";
import { createUnitCommand } from "@/engine/units/commands";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import { applyMoveOrder } from "@/game/commands/move/applyMoveOrder";
import { buildContextRouteUpdate } from "@/game/commands/move/moveRoute";
import { buildMovePlan } from "@/game/commands/move/movePlan";
import { getColumnSegmentRoutePoints } from "@/engine/units/formationMoveAlgorithms/columnAlgorithms";

/**
 * Stands in for the A* road path: step onto the road nearby, then turn towards
 * the goal. Straight lines in the resulting orders mean the road was ignored.
 */
const roadPath = vi.hoisted(() => {
  const entryDistance = 20;
  return {
    calls: [] as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>,
    build(from: { x: number; y: number }, to: { x: number; y: number }) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length <= entryDistance) return [{ x: to.x, y: to.y }];
      const ratio = entryDistance / length;
      return [
        { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio },
        { x: to.x, y: from.y },
        { x: to.x, y: to.y },
      ];
    },
  };
});

vi.mock("@/engine/world/roadPath", () => ({
  buildRoadTurnRoutePoints: (_world: unknown, from: vec2, to: vec2): vec2[] => {
    roadPath.calls.push({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } });
    return roadPath.build(from, to);
  },
}));

function dedupe(points: vec2[]): vec2[] {
  return points.filter((point, index) => {
    const prev = points[index - 1];
    return !prev || prev.x !== point.x || prev.y !== point.y;
  });
}

function expectedRoadPath(from: vec2, to: vec2): vec2[] {
  return dedupe(roadPath.build(from, to));
}

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

function moveTargets(unit: BaseUnit): vec2[] {
  return unit
    .getCommands()
    .filter((command) => command.type === UnitCommandTypes.Move)
    .map((command) => ((command as MoveCommand).getState().state as MoveCommandState).target);
}

const worldWithoutRoadSnapping = {
  findNearestObjectLocalCenter: () => null,
  findNearestObjectPoint: () => null,
};

/** Builds the route the way the move tool does, with smart path turned on. */
function buildSmartRoute(units: BaseUnit[], pos: vec2): vec2[] {
  return buildContextRouteUpdate({
    mode: "column",
    pos,
    append: false,
    targets: [],
    routeStartPos: units[0]!.pos,
    movingUnits: units,
    world: worldWithoutRoadSnapping,
    getSegmentRoutePoints: (from, to) => getColumnSegmentRoutePoints(null as never, from, to, true, true),
  }).map((point) => point.pos);
}

function orderColumnMove(units: BaseUnit[], route: vec2[]): void {
  // Only the paths built while applying the order are of interest here.
  roadPath.calls.length = 0;
  applyMoveOrder({
    movingUnits: units,
    routeTargets: route.map((pos) => ({ pos, modifier: null })),
    plan: buildMovePlan(units, route[0]!),
    formationCenter: null,
    formationOffsets: {},
    moveMode: "column",
    smartPathEnabled: true,
    hasObjectMap: true,
    selectedAbilities: [],
    isPatrol: false,
    createUniqueId: () => "test-order",
    roomWorld: window.ROOM_WORLD,
    emitDirectViewOrder: () => {},
    playerTeam: Team.ADMIN,
    metersPerPixel: 1,
  });
}

function pathCallsFrom(pos: vec2): Array<{ from: vec2; to: vec2 }> {
  return roadPath.calls.filter((call) => call.from.x === pos.x && call.from.y === pos.y);
}

beforeEach(() => {
  roadPath.calls.length = 0;
  window.ROOM_PARAMS = {};
  window.ROOM_SETTINGS = {};
  window.PLAYER = { name: "admin", team: Team.ADMIN };
  window.ROOM_WORLD = {
    stage: RoomGameStage.WAR,
    // Route building measures the collision range in pixels, so it needs a
    // scale to measure it against.
    map: { width: 1000, height: 1000, metersPerPixel: 1 },
    hasObjectNavMeshMap: () => true,
  } as unknown as typeof window.ROOM_WORLD;
});

describe("column smart path", () => {
  it("paths every unit of a folding column onto the route", () => {
    const units = [
      createUnit("1", 0, 0),
      createUnit("2", 0, 30),
      createUnit("3", 0, 60),
      createUnit("4", 0, 90),
      createUnit("5", 0, 120),
    ];

    const route = buildSmartRoute(units, { x: 600, y: 60 });
    orderColumnMove(units, route);

    for (const unit of units) {
      expect(pathCallsFrom(unit.pos), `unit ${unit.id} joins the route on its own path`).toHaveLength(1);
    }
  });

  it("sends the tail unit along the road instead of straight at the route", () => {
    const units = [
      createUnit("1", 0, 0),
      createUnit("2", 0, 30),
      createUnit("3", 0, 60),
      createUnit("4", 0, 90),
      createUnit("5", 0, 120),
    ];

    const route = buildSmartRoute(units, { x: 600, y: 60 });
    orderColumnMove(units, route);

    const tail = units[0]!;
    const joinPoint = pathCallsFrom(tail.pos)[0]!.to;
    const roadToRoute = expectedRoadPath(tail.pos, joinPoint);

    expect(moveTargets(tail).slice(0, roadToRoute.length)).toEqual(roadToRoute);
  });

  it("paths a follower when its first move starts after an earlier route segment", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];
    const route = [{ x: 0, y: 70 }, { x: 600, y: 70 }];

    orderColumnMove(units, route);

    const tail = units[0]!;
    const joinPoint = pathCallsFrom(tail.pos)[0]!.to;
    expect(moveTargets(tail).slice(0, expectedRoadPath(tail.pos, joinPoint).length))
      .toEqual(expectedRoadPath(tail.pos, joinPoint));
  });

  it("keeps pathing the leader from its own position", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    const route = buildSmartRoute(units, { x: 600, y: 60 });
    orderColumnMove(units, route);

    const leader = units[2]!;
    expect(pathCallsFrom(leader.pos)).toHaveLength(1);
    expect(moveTargets(leader)[0]).toEqual(expectedRoadPath(leader.pos, route[0]!)[0]);
  });

  it("walks the tail unit through the turns of the route instead of cutting them", () => {
    const units = [
      createUnit("1", 0, 0),
      createUnit("2", 0, 30),
      createUnit("3", 0, 60),
      createUnit("4", 0, 90),
      createUnit("5", 0, 120),
    ];

    const route = buildSmartRoute(units, { x: 600, y: 300 });
    expect(route.length).toBeGreaterThan(2);
    orderColumnMove(units, route);

    const turnPoint = route[route.length - 2]!;
    expect(moveTargets(units[0]!)).toContainEqual(turnPoint);
  });

  it("paths a unit from its last planned position, not from where it stands", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    const firstRoute = buildSmartRoute(units, { x: 600, y: 60 });
    orderColumnMove(units, firstRoute);
    roadPath.calls.length = 0;

    const secondRoute = buildSmartRoute(units, { x: 1200, y: 60 });
    orderColumnMove(units, secondRoute);

    for (const unit of units) {
      expect(pathCallsFrom(unit.pos), `unit ${unit.id} is not re-pathed from its old position`)
        .toHaveLength(0);
    }
  });
});

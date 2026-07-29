// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { beforeEach, describe, expect, it } from "vitest";
import type { vec2 } from "@/engine/types";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import type { BaseUnit } from "@/engine/units/baseUnit";
import { buildContextRouteUpdate, getColumnRouteStartPosByTarget } from "@/game/commands/move";

function createUnit(id: string, x: number, y: number): BaseUnit {
  return {
    id,
    pos: { x, y },
    team: Team.RED,
    type: "infantry",
    directView: false,
    isRetreat: false,
    getCommands: () => [],
  } as unknown as BaseUnit;
}

const worldWithoutRoads = {
  findNearestObjectLocalCenter: () => null,
  findNearestObjectPoint: () => null,
};

function distance(a: vec2, b: vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

describe("getColumnRouteStartPosByTarget", () => {
  it("starts the route at the unit that leads the column", () => {
    const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

    expect(getColumnRouteStartPosByTarget({ x: 0, y: 600 }, units)).toEqual({ x: 0, y: 60 });
    expect(getColumnRouteStartPosByTarget({ x: 0, y: -600 }, units)).toEqual({ x: 0, y: 0 });
  });

  it("starts from the middle unit when the target is sideways", () => {
    const units = [
      createUnit("1", 0, 0),
      createUnit("2", 0, 30),
      createUnit("3", 0, 60),
      createUnit("4", 0, 90),
      createUnit("5", 0, 120),
    ];

    expect(getColumnRouteStartPosByTarget({ x: 600, y: 60 }, units)).toEqual({ x: 0, y: 60 });
  });
});

describe("buildContextRouteUpdate in column mode", () => {
  const units = [createUnit("1", 0, 0), createUnit("2", 0, 30), createUnit("3", 0, 60)];

  it("builds a route straight to the target without a smart path", () => {
    const target = { x: 0, y: 600 };

    const route = buildContextRouteUpdate({
      mode: "column",
      pos: target,
      append: false,
      targets: [],
      routeStartPos: units[0]!.pos,
      movingUnits: units,
      world: worldWithoutRoads,
      getSegmentRoutePoints: (_from, to) => [to],
    });

    expect(route.map((point) => point.pos)).toEqual([target]);
  });

  it("builds the smart path from the leading unit", () => {
    const target = { x: 0, y: 600 };
    const seenStarts: vec2[] = [];

    buildContextRouteUpdate({
      mode: "column",
      pos: target,
      append: false,
      targets: [],
      routeStartPos: units[0]!.pos,
      movingUnits: units,
      world: worldWithoutRoads,
      getSegmentRoutePoints: (from, to) => {
        seenStarts.push(from);
        return [to];
      },
    });

    expect(seenStarts).toEqual([{ x: 0, y: 60 }]);
  });

  it("drops a smart path head that would send the column backwards", () => {
    const target = { x: 0, y: 600 };

    const route = buildContextRouteUpdate({
      mode: "column",
      pos: target,
      append: false,
      targets: [],
      routeStartPos: units[0]!.pos,
      movingUnits: units,
      world: worldWithoutRoads,
      // A road path that first walks back past the whole group.
      getSegmentRoutePoints: (_from, to) => [{ x: 0, y: -100 }, { x: 0, y: 300 }, to],
    });

    const head = route[0]!.pos;
    for (const unit of units) {
      expect(distance(head, target)).toBeLessThanOrEqual(distance(unit.pos, target));
    }
  });

  it("appends new targets to the end of an existing route", () => {
    const first = { x: 0, y: 400 };
    const second = { x: 400, y: 400 };
    const seenStarts: vec2[] = [];

    const route = buildContextRouteUpdate({
      mode: "column",
      pos: second,
      append: true,
      targets: [{ pos: first, modifier: null }],
      routeStartPos: units[0]!.pos,
      movingUnits: units,
      world: worldWithoutRoads,
      getSegmentRoutePoints: (from, to) => {
        seenStarts.push(from);
        return [to];
      },
    });

    expect(seenStarts).toEqual([first]);
    expect(route.map((point) => point.pos)).toEqual([first, second]);
  });
});

// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import { world } from "@/engine/world/world";
import type { unitstate } from "@/engine/units/types";
import defaultResourcePack from "../../../public/assets/default_resourcepack.json";

/**
 * `teamUnitLimits` under a client that lays out several units at once.
 *
 * The spawn tool places one unit per call, so a batch is a path only a
 * programmatic client takes — which is how the whole allowance could be
 * halved without anyone noticing.
 */

function place(x: number, type = "marine", team: Team = Team.RED): unitstate {
  return {
    id: `${type}-${team}-${x}`,
    type,
    team,
    pos: { x, y: 100 },
  } as unknown as unitstate;
}

function countByType(instance: world): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of instance.units.list()) {
    counts[unit.type] = (counts[unit.type] ?? 0) + 1;
  }
  return counts;
}

let instance: world;

beforeEach(() => {
  window.ROOM_PARAMS = {};
  window.ROOM_SETTINGS = {
    teamUnitLimits: { [Team.RED]: { marine: 3, militia: 0 } },
  } as unknown as typeof window.ROOM_SETTINGS;
  window.PLAYER = { name: "red", team: Team.RED };
  window.RESOURCEPACK = defaultResourcePack as unknown as typeof window.RESOURCEPACK;

  instance = new world({
    imageUrl: "",
    heightMapUrl: "",
    width: 1000,
    height: 1000,
    metersPerPixel: 1,
  });
  instance.stage = RoomGameStage.PLANNING;
  window.ROOM_WORLD = instance as unknown as typeof window.ROOM_WORLD;
});

describe("addUnits under teamUnitLimits", () => {
  it("accepts a batch up to the whole allowance", () => {
    instance.addUnits([place(100), place(140), place(180)]);

    expect(countByType(instance).marine).toBe(3);
  });

  it("stops the batch at the allowance and no earlier", () => {
    instance.addUnits([place(100), place(140), place(180), place(220), place(260)]);

    expect(countByType(instance).marine).toBe(3);
  });

  it("counts units already on the board against a later batch", () => {
    instance.addUnits([place(100), place(140)]);
    instance.addUnits([place(180), place(220)]);

    expect(countByType(instance).marine).toBe(3);
  });

  it("raises none of a type allowed none", () => {
    instance.addUnits([place(100, "militia"), place(140, "militia")]);

    expect(countByType(instance).militia).toBeUndefined();
  });

  it("leaves a type nobody limited alone", () => {
    instance.addUnits([place(100, "infantry"), place(140, "infantry"), place(180, "infantry")]);

    expect(countByType(instance).infantry).toBe(3);
  });
});

describe("who a placed unit may belong to", () => {
  it("refuses a player the other side's force", () => {
    instance.addUnits([place(100, "infantry", Team.BLUE)]);

    expect(instance.units.list()).toHaveLength(0);
  });

  it("still refuses it once the war has started", () => {
    instance.stage = RoomGameStage.WAR;

    instance.addUnits([place(100, "infantry", Team.BLUE)]);

    expect(instance.units.list()).toHaveLength(0);
  });

  it("does not spend the other side's allowance on the refusal", () => {
    window.ROOM_SETTINGS.teamUnitLimits = {
      [Team.RED]: { marine: 3 },
      [Team.BLUE]: { marine: 3 },
    };

    instance.addUnits([place(100, "marine", Team.BLUE), place(140), place(180), place(220)]);

    expect(countByType(instance).marine).toBe(3);
    expect(instance.units.list().every((unit) => unit.team === Team.RED)).toBe(true);
  });

  it("lets the umpire lay out both sides", () => {
    window.PLAYER = { name: "umpire", team: Team.ADMIN };

    instance.addUnits([place(100, "infantry", Team.RED), place(140, "infantry", Team.BLUE)]);

    expect(instance.units.list()).toHaveLength(2);
  });
});

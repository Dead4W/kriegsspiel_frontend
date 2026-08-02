// The engine barrel has to be initialized first: baseUnit and the engine index
// import each other, and the app happens to load the index first.
import "@/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import { world } from "@/engine/world/world";
import type { BaseUnit } from "@/engine/units/baseUnit";
import type { unitstate } from "@/engine/units/types";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand";
import { ROOM_SETTING_KEYS } from "@/enums/roomSettingsKeys";
import defaultResourcePack from "../../../../../public/assets/default_resourcepack.json";

/**
 * What a leg of a march costs.
 *
 * Infantry walk 80 m/min and the board is a metre to the pixel, so an
 * unhindered 2000 px leg is 1500 s. Everything here is that number bent by
 * ground the unit crosses or by how tired it gets on the way.
 */

const MAP_WIDTH = 4000;
const MAP_HEIGHT = 200;
const LANE_Y = 100;
const PLAIN_SECONDS_PER_2000_PX = 1500;

let instance: world;

function createUnit(overrides: Partial<unitstate> = {}): BaseUnit {
  return instance.units.upsert({
    id: "unit-1",
    type: "infantry",
    team: Team.RED,
    pos: { x: 0, y: LANE_Y },
    ...overrides,
  } as unitstate);
}

/** Paints one object-map entity over a vertical band of the board. */
function paintBand(entity: string, fromX: number, toX: number) {
  const pixels = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = Math.max(0, fromX); x < Math.min(MAP_WIDTH, toX); x += 1) {
      pixels[(y * MAP_WIDTH) + x] = 1;
    }
  }
  instance.setObjectNavMeshDecoded(MAP_WIDTH, MAP_HEIGHT, ["", entity], pixels);
}

function moveTo(x: number, state: Partial<MoveCommandState> = {}): MoveCommand {
  return new MoveCommand({
    target: { x, y: LANE_Y },
    modifier: null,
    abilities: [],
    orderIndex: 0,
    uniqueId: "order-1",
    isPatrol: false,
    ...state,
  });
}

beforeEach(() => {
  window.ROOM_PARAMS = {};
  window.ROOM_SETTINGS = {} as unknown as typeof window.ROOM_SETTINGS;
  window.PLAYER = { name: "red", team: Team.RED };
  window.RESOURCEPACK = defaultResourcePack as unknown as typeof window.RESOURCEPACK;

  instance = new world({
    imageUrl: "",
    heightMapUrl: "",
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    metersPerPixel: 1,
  });
  instance.stage = RoomGameStage.WAR;
  window.ROOM_WORLD = instance as unknown as typeof window.ROOM_WORLD;
});

describe("estimating a march", () => {
  it("prices a plain leg at the unit's own pace", () => {
    const unit = createUnit();

    expect(moveTo(2000).estimate(unit)).toBe(PLAIN_SECONDS_PER_2000_PX);
  });

  it("prices an ordered environment for the whole leg", () => {
    const unit = createUnit();

    // in_forest halves speed in the default pack.
    expect(moveTo(2000, { modifier: "in_forest" }).estimate(unit))
      .toBe(PLAIN_SECONDS_PER_2000_PX * 2);
  });

  it("charges each stretch to the ground under it", () => {
    paintBand("forest", 2000, MAP_WIDTH);
    const unit = createUnit();

    const seconds = moveTo(MAP_WIDTH).estimate(unit);

    // Half the leg in the open and half in the forest: neither pace alone
    // answers it, which is what a single division off the unit's speed did.
    const openAllTheWay = PLAIN_SECONDS_PER_2000_PX * 2;
    const forestAllTheWay = openAllTheWay * 2;
    expect(seconds).toBeGreaterThan(openAllTheWay);
    expect(seconds).toBeLessThan(forestAllTheWay);
    expect(seconds).toBeGreaterThan(openAllTheWay * 1.3);
    expect(seconds).toBeLessThan(openAllTheWay * 1.7);
  });

  it("reads the ground from where the leg starts, not from where the unit is", () => {
    paintBand("forest", 2000, MAP_WIDTH);
    const unit = createUnit();

    // How the panel prices a second leg: it starts where the first one ended.
    const fromForestEdge = moveTo(MAP_WIDTH).estimate(unit, { x: 2000, y: LANE_Y });

    expect(fromForestEdge).toBe(PLAIN_SECONDS_PER_2000_PX * 2);
    expect(moveTo(MAP_WIDTH).estimate(unit)).toBeGreaterThan(fromForestEdge);
  });

  it("lets the march tire the unit as it walks it", () => {
    const unit = createUnit();
    unit.fatigue = 4.9;

    const rested = moveTo(MAP_WIDTH).estimate(unit);
    window.ROOM_SETTINGS[ROOM_SETTING_KEYS.FATIGUE] = true;
    const tiring = moveTo(MAP_WIDTH).estimate(unit);

    // The unit crosses the 5-point threshold early on and loses a fifth of its
    // speed for the rest, so it lands between the two flat answers.
    expect(rested).toBe(PLAIN_SECONDS_PER_2000_PX * 2);
    expect(tiring).toBeGreaterThan(rested);
    expect(tiring).toBeLessThan(rested / 0.8);
  });

  it("leaves the unit exactly as it found it", () => {
    const unit = createUnit();
    unit.envState = ["in_field"];
    unit.fatigue = 3;
    window.ROOM_SETTINGS[ROOM_SETTING_KEYS.FATIGUE] = true;

    moveTo(MAP_WIDTH, { modifier: "in_forest", abilities: ["forceWalking"] }).estimate(unit);

    expect(unit.envState).toEqual(["in_field"]);
    expect(unit.fatigue).toBe(3);
    expect(unit.activeAbilityType).toBeNull();
  });
});

describe("what the estimate remembers", () => {
  it("answers a different starting point differently", () => {
    paintBand("forest", 2000, MAP_WIDTH);
    const unit = createUnit();
    const command = moveTo(MAP_WIDTH);

    const fromStart = command.estimate(unit, { x: 0, y: LANE_Y });
    const fromHalfway = command.estimate(unit, { x: 2000, y: LANE_Y });

    expect(fromHalfway).toBeLessThan(fromStart);
  });

  it("shortens as the unit advances", () => {
    const unit = createUnit();
    const command = moveTo(2000);

    const beforeStep = command.estimate(unit);
    unit.pos = { x: 1000, y: LANE_Y };

    expect(command.estimate(unit)).toBeLessThan(beforeStep);
  });

  it("forgets the board it was told about when a new one arrives", () => {
    const unit = createUnit();
    const command = moveTo(2000);

    expect(command.estimate(unit)).toBe(PLAIN_SECONDS_PER_2000_PX);
    paintBand("forest", 0, MAP_WIDTH);

    expect(command.estimate(unit)).toBe(PLAIN_SECONDS_PER_2000_PX * 2);
  });

  it("follows the unit's own state rather than its identity", () => {
    const unit = createUnit();
    const command = moveTo(2000);

    const upright = command.estimate(unit);
    unit.setFormation("springing");

    expect(command.estimate(unit)).toBeGreaterThan(upright);
  });
});

describe("walking a leg", () => {
  it("lands on the target instead of stepping past it", () => {
    const unit = createUnit();
    const command = moveTo(100);

    // A step long enough to cover twice the distance left.
    command.update(unit, 150);

    expect(unit.pos).toEqual({ x: 100, y: LANE_Y });
  });
});

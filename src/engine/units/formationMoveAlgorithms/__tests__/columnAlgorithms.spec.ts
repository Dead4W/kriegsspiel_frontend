import { describe, expect, it } from "vitest";
import type { vec2 } from "@/engine/types";
import {
  buildColumnPlanByFirstTargetDistance,
  getColumnPosition,
  type ColumnPlanItem,
  type ColumnPlanSeedItem,
} from "@/engine/units/formationMoveAlgorithms/columnAlgorithms";

const SPACING = 30;

function seed(unitId: string, x: number, y: number): ColumnPlanSeedItem {
  return { unitId, startPos: { x, y } };
}

function orderedIds(plan: ColumnPlanItem[]): string[] {
  return [...plan].sort((a, b) => a.orderIndex - b.orderIndex).map((item) => item.unitId);
}

function orderIndexOf(plan: ColumnPlanItem[], unitId: string): number {
  return plan.find((item) => item.unitId === unitId)!.orderIndex;
}

/**
 * Walks the whole route the way applyMoveOrder does and returns the last point
 * every unit is ordered to reach.
 */
function finalPositions(seeds: ColumnPlanSeedItem[], targets: vec2[]): Map<string, vec2> {
  const plan = buildColumnPlanByFirstTargetDistance(seeds, targets[0]!);
  const result = new Map<string, vec2>();

  for (const item of plan) {
    let pos: vec2 = item.startPos;
    for (let segIndex = 0; segIndex < targets.length; segIndex += 1) {
      const points = getColumnPosition(segIndex, item.orderIndex, targets, plan, SPACING);
      if (points.length) pos = points[points.length - 1]!;
    }
    result.set(item.unitId, pos);
  }

  return result;
}

/** Unit ids sorted from the tail of the column to its head. */
function arrangementAlong(positions: Map<string, vec2>, direction: vec2): string[] {
  const length = Math.hypot(direction.x, direction.y);
  const dir = { x: direction.x / length, y: direction.y / length };
  return [...positions.entries()]
    .sort(([, a], [, b]) => (a.x * dir.x + a.y * dir.y) - (b.x * dir.x + b.y * dir.y))
    .map(([unitId]) => unitId);
}

function distance(a: vec2, b: vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("buildColumnPlanByFirstTargetDistance", () => {
  it("makes the unit nearest to the target the leader (horizontal row, target on the right)", () => {
    const plan = buildColumnPlanByFirstTargetDistance(
      [seed("1", 0, 0), seed("2", 30, 0), seed("3", 60, 0)],
      { x: 600, y: 0 }
    );

    expect(orderedIds(plan)).toEqual(["3", "2", "1"]);
  });

  it("mirrors the order when the target is on the left", () => {
    const plan = buildColumnPlanByFirstTargetDistance(
      [seed("1", 0, 0), seed("2", 30, 0), seed("3", 60, 0)],
      { x: -600, y: 0 }
    );

    expect(orderedIds(plan)).toEqual(["1", "2", "3"]);
  });

  it("makes the bottom unit the leader for a vertical stack moving down", () => {
    const plan = buildColumnPlanByFirstTargetDistance(
      [seed("1", 0, 0), seed("2", 0, 30), seed("3", 0, 60)],
      { x: 0, y: 600 }
    );

    expect(orderedIds(plan)).toEqual(["3", "2", "1"]);
  });

  it("keeps the diagonal order when moving along the diagonal", () => {
    const plan = buildColumnPlanByFirstTargetDistance(
      [seed("1", 0, 0), seed("2", 30, 30), seed("3", 60, 60)],
      { x: 600, y: 600 }
    );

    expect(orderedIds(plan)).toEqual(["3", "2", "1"]);
  });

  it("starts the column from the middle unit when the target is sideways", () => {
    const seeds = [seed("1", 0, 0), seed("2", 0, 30), seed("3", 0, 60), seed("4", 0, 90), seed("5", 0, 120)];

    const plan = buildColumnPlanByFirstTargetDistance(seeds, { x: 600, y: 60 });

    expect(orderIndexOf(plan, "3")).toBe(0);
    expect([orderIndexOf(plan, "2"), orderIndexOf(plan, "4")].sort()).toEqual([1, 2]);
    expect([orderIndexOf(plan, "1"), orderIndexOf(plan, "5")].sort()).toEqual([3, 4]);
  });

  it("is stable for equal distances", () => {
    const seeds = [seed("b", 0, 0), seed("a", 0, 0), seed("c", 0, 0)];

    expect(orderedIds(buildColumnPlanByFirstTargetDistance(seeds, { x: 0, y: 600 }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("column marching order", () => {
  it("keeps 1 2 3 arranged as 1 2 3 when moving horizontally", () => {
    const positions = finalPositions(
      [seed("1", 0, 0), seed("2", 30, 0), seed("3", 60, 0)],
      [{ x: 600, y: 0 }]
    );

    expect(arrangementAlong(positions, { x: 1, y: 0 })).toEqual(["1", "2", "3"]);
  });

  it("keeps 1 2 3 arranged as 1 2 3 when moving vertically", () => {
    const positions = finalPositions(
      [seed("1", 0, 0), seed("2", 0, 30), seed("3", 0, 60)],
      [{ x: 0, y: 600 }]
    );

    expect(arrangementAlong(positions, { x: 0, y: 1 })).toEqual(["1", "2", "3"]);
  });

  it("keeps 1 2 3 arranged as 1 2 3 when moving diagonally", () => {
    const positions = finalPositions(
      [seed("1", 0, 0), seed("2", 30, 30), seed("3", 60, 60)],
      [{ x: 600, y: 600 }]
    );

    expect(arrangementAlong(positions, { x: 1, y: 1 })).toEqual(["1", "2", "3"]);
  });

  it("folds a sideways line into 1 5 2 4 3 with the middle unit in front", () => {
    const seeds = [seed("1", 0, 0), seed("2", 0, 30), seed("3", 0, 60), seed("4", 0, 90), seed("5", 0, 120)];

    const positions = finalPositions(seeds, [{ x: 600, y: 60 }]);
    const arrangement = arrangementAlong(positions, { x: 1, y: 0 });

    expect(arrangement[4]).toBe("3");
    expect([arrangement[2], arrangement[3]].sort()).toEqual(["2", "4"]);
    expect([arrangement[0], arrangement[1]].sort()).toEqual(["1", "5"]);
  });

  it("puts the leader on the target and spaces followers behind it", () => {
    const target = { x: 600, y: 0 };
    const positions = finalPositions(
      [seed("1", 0, 0), seed("2", 30, 0), seed("3", 60, 0)],
      [target]
    );

    expect(positions.get("3")).toEqual(target);
    expect(distance(positions.get("2")!, target)).toBeCloseTo(SPACING, 6);
    expect(distance(positions.get("1")!, target)).toBeCloseTo(SPACING * 2, 6);
  });

  it("keeps the order through a multi point route with a turn", () => {
    const seeds = [seed("1", 0, 0), seed("2", 0, 30), seed("3", 0, 60)];
    const targets = [
      { x: 0, y: 400 },
      { x: 400, y: 400 },
    ];

    const plan = buildColumnPlanByFirstTargetDistance(seeds, targets[0]!);
    expect(orderedIds(plan)).toEqual(["3", "2", "1"]);

    const positions = finalPositions(seeds, targets);
    expect(arrangementAlong(positions, { x: 1, y: 0 })).toEqual(["1", "2", "3"]);
  });

  it("never orders a unit to move away from the target", () => {
    const target = { x: 600, y: 60 };
    const seeds = [seed("1", 0, 0), seed("2", 0, 30), seed("3", 0, 60), seed("4", 0, 90), seed("5", 0, 120)];
    const plan = buildColumnPlanByFirstTargetDistance(seeds, target);

    for (const item of plan) {
      const points = getColumnPosition(0, item.orderIndex, [target], plan, SPACING);
      let from = item.startPos;
      for (const point of points) {
        expect(distance(point, target)).toBeLessThanOrEqual(distance(from, target) + 1e-6);
        from = point;
      }
    }
  });
});

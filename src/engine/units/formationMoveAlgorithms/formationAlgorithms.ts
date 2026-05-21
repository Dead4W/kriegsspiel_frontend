import type { vec2 } from "@/engine/types.ts";

export type FormationSeedItem = {
  unitId: string;
  startPos: vec2;
};

export function buildFormationCenter(units: FormationSeedItem[]): vec2 | null {
  if (!units.length) return null;
  const sum = units.reduce(
    (acc, unit) => ({
      x: acc.x + unit.startPos.x,
      y: acc.y + unit.startPos.y,
    }),
    { x: 0, y: 0 }
  );
  return {
    x: sum.x / units.length,
    y: sum.y / units.length,
  };
}

export function buildFormationOffsets(
  units: FormationSeedItem[],
  center: vec2 | null
): Record<string, vec2> {
  if (!center) return {};
  return Object.fromEntries(
    units.map((unit) => [
      unit.unitId,
      {
        x: unit.startPos.x - center.x,
        y: unit.startPos.y - center.y,
      },
    ])
  );
}

function getRouteSegmentAngle(from: vec2, to: vec2): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
}

function rotateVector(v: vec2, angle: number): vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  };
}

export function buildFormationSegmentAngles(
  formationCenter: vec2 | null,
  routePoints: vec2[],
  metersPerPixel = 1,
  minSegmentMeters = 8
): Array<number | null> {
  const result: Array<number | null> = [];
  if (!formationCenter || !routePoints.length) return result;
  let lastAngle: number | null = null;
  for (let i = 0; i < routePoints.length; i += 1) {
    const segFrom = i === 0 ? formationCenter : routePoints[i - 1]!;
    const segTo = routePoints[i]!;
    const nextAngle = getRouteSegmentAngle(segFrom, segTo);
    const distMeters = Math.hypot(segTo.x - segFrom.x, segTo.y - segFrom.y) * metersPerPixel;
    if (nextAngle != null && distMeters >= minSegmentMeters) {
      lastAngle = nextAngle;
    }
    result.push(lastAngle);
  }
  return result;
}

export function getFormationSegmentAngles(
  formationCenter: vec2 | null,
  routePoints: vec2[],
  metersPerPixel = 1,
  minSegmentMeters = 8
): Array<number | null> {
  return buildFormationSegmentAngles(formationCenter, routePoints, metersPerPixel, minSegmentMeters);
}

export function getFormationReferenceAngle(segmentAngles: Array<number | null>): number | null {
  return segmentAngles[0] ?? null;
}

export function getFormationTargetPoint(
  segIndex: number,
  target: vec2,
  unitOffset: vec2 | undefined,
  segmentAngles: Array<number | null>,
  refAngle: number | null
): vec2 {
  if (!unitOffset) return target;

  if (refAngle == null) {
    return {
      x: target.x + unitOffset.x,
      y: target.y + unitOffset.y,
    };
  }

  const segAngle = segmentAngles[segIndex] ?? refAngle;
  if (segAngle == null) {
    return {
      x: target.x + unitOffset.x,
      y: target.y + unitOffset.y,
    };
  }

  const rotatedOffset = rotateVector(unitOffset, segAngle - refAngle);
  return {
    x: target.x + rotatedOffset.x,
    y: target.y + rotatedOffset.y,
  };
}

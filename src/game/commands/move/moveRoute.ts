import { BaseUnit } from "@/engine/units/baseUnit";
import type { vec2 } from "@/engine/types";
import type { MoveMode, MoveRoutePoint } from "./types";
import { buildMovePlan, getUnitPlannedPos } from "./movePlan";

type MoveRouteOptions = {
  ignoreExistingMoveCommands?: boolean;
};

interface MoveRouteWorld {
  findNearestObjectLocalCenter(
    pos: vec2,
    groups: string[],
    radius: number,
    maxStep: number
  ): { center: vec2 } | null;
  findNearestObjectPoint(pos: vec2, groups: string[], radius: number): vec2 | null;
}

export function getRouteDistancesMeters(start: vec2 | null, targets: MoveRoutePoint[], metersPerPixel: number): number[] {
  if (!start || !targets.length) return [];

  let prev = start;
  return targets.map((target) => {
    const total = Math.hypot(target.pos.x - prev.x, target.pos.y - prev.y) * metersPerPixel;
    prev = target.pos;
    return total;
  });
}

export function getNearestSelectedUnitPlannedPos(
  point: vec2,
  units: BaseUnit[],
  options?: MoveRouteOptions
): vec2 | null {
  if (!units.length) return null;

  let bestPos: vec2 | null = null;
  let bestDist = Infinity;
  for (const unit of units) {
    const pos = getUnitPlannedPos(unit, options);
    const dist = Math.hypot(pos.x - point.x, pos.y - point.y);
    if (dist >= bestDist) continue;
    bestDist = dist;
    bestPos = pos;
  }
  return bestPos ? { x: bestPos.x, y: bestPos.y } : null;
}

export function getColumnRouteStartPosByTarget(
  firstTarget: vec2,
  units: BaseUnit[],
  options?: MoveRouteOptions
): vec2 | null {
  if (!units.length) return null;
  const columnPlan = buildMovePlan(units, firstTarget, options);
  const leader = columnPlan[0];
  if (!leader) return null;
  return { x: leader.startPos.x, y: leader.startPos.y };
}

function minDistanceToPositions(point: vec2, positions: vec2[]): number {
  if (!positions.length) return Infinity;
  let minDist = Infinity;
  for (const pos of positions) {
    const dist = Math.hypot(point.x - pos.x, point.y - pos.y);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

function trimRouteHeadByNearestUnitDistance(routePoints: vec2[], unitPositions: vec2[]): vec2[] {
  if (routePoints.length <= 1 || !unitPositions.length) return [...routePoints];

  let headIndex = 0;
  while (headIndex < routePoints.length - 1) {
    const currentDist = minDistanceToPositions(routePoints[headIndex]!, unitPositions);
    const nextDist = minDistanceToPositions(routePoints[headIndex + 1]!, unitPositions);
    if (nextDist <= currentDist) {
      headIndex += 1;
      continue;
    }
    break;
  }
  return routePoints.slice(headIndex);
}

function normalizeInitialRoutePoints(routePoints: vec2[], units: BaseUnit[], options?: MoveRouteOptions): vec2[] {
  if (!routePoints.length || !units.length) return routePoints;

  const unitPositions = units.map((unit) => getUnitPlannedPos(unit, options));
  const routeHead = routePoints[0]!;
  const anchor = unitPositions.reduce((best, pos) => {
    if (!best) return pos;
    const bestDist = Math.hypot(best.x - routeHead.x, best.y - routeHead.y);
    const posDist = Math.hypot(pos.x - routeHead.x, pos.y - routeHead.y);
    return posDist < bestDist ? pos : best;
  }, null as vec2 | null);

  const localClusterRadius = Math.max(BaseUnit.COLLISION_RANGE * 2, 20);
  const localUnitPositions = anchor
    ? unitPositions.filter((pos) => Math.hypot(pos.x - anchor.x, pos.y - anchor.y) <= localClusterRadius)
    : unitPositions;
  const normalizeByPositions = localUnitPositions.length ? localUnitPositions : unitPositions;

  const trimmed = trimRouteHeadByNearestUnitDistance(routePoints, normalizeByPositions);
  if (trimmed.length <= 1) return trimmed;

  const minClearance = Math.max(8, BaseUnit.COLLISION_RANGE * 0.45);
  let keepFrom = 0;
  while (keepFrom < trimmed.length - 1) {
    const dist = minDistanceToPositions(trimmed[keepFrom]!, normalizeByPositions);
    if (dist > minClearance) break;
    keepFrom += 1;
  }
  return trimmed.slice(keepFrom);
}

function snapTargetPos(world: MoveRouteWorld, mode: MoveMode, pos: vec2): vec2 {
  if (mode !== "column") return pos;
  return (
    world.findNearestObjectLocalCenter(pos, ["good_road", "road"], 30, 12)?.center ??
    world.findNearestObjectPoint(pos, ["good_road", "road"], 30) ??
    pos
  );
}

interface BuildContextRouteUpdateOptions {
  mode: MoveMode;
  pos: vec2;
  append: boolean;
  targets: MoveRoutePoint[];
  routeStartPos: vec2 | null;
  movingUnits: BaseUnit[];
  world: MoveRouteWorld;
  getSegmentRoutePoints: (from: vec2, to: vec2) => vec2[];
  ignoreExistingMoveCommands?: boolean;
}

export function buildContextRouteUpdate(options: BuildContextRouteUpdateOptions): MoveRoutePoint[] {
  const {
    mode,
    pos,
    append,
    targets,
    routeStartPos,
    movingUnits,
    world,
    getSegmentRoutePoints,
    ignoreExistingMoveCommands,
  } = options;
  const snappedPos = snapTargetPos(world, mode, pos);
  const modifier = targets[targets.length - 1]?.modifier ?? null;
  const preferredColumnStart = mode === "column"
    ? getColumnRouteStartPosByTarget(snappedPos, movingUnits, { ignoreExistingMoveCommands })
    : null;

  if (append) {
    const start = targets[targets.length - 1]?.pos ?? preferredColumnStart ?? routeStartPos ?? snappedPos;
    const rawRoutePoints = getSegmentRoutePoints(start, snappedPos);
    const normalizedRoutePoints = targets.length
      ? rawRoutePoints
      : normalizeInitialRoutePoints(rawRoutePoints, movingUnits, { ignoreExistingMoveCommands });
    return [...targets, ...normalizedRoutePoints.map((point) => ({ pos: point, modifier }))];
  }

  const hasTargets = targets.length > 0;
  const nearestSelectedStart = getNearestSelectedUnitPlannedPos(
    snappedPos,
    movingUnits,
    { ignoreExistingMoveCommands }
  );
  const start = hasTargets
    ? (targets.length > 1 ? targets[targets.length - 2]!.pos : routeStartPos ?? targets[0]!.pos)
    : (preferredColumnStart ?? nearestSelectedStart ?? routeStartPos ?? snappedPos);
  const rawRoutePoints = getSegmentRoutePoints(start, snappedPos);
  const normalizedRoutePoints = !hasTargets
    ? normalizeInitialRoutePoints(rawRoutePoints, movingUnits, { ignoreExistingMoveCommands })
    : rawRoutePoints;
  const nextRoutePoints = normalizedRoutePoints.map((point) => ({ pos: point, modifier }));

  if (!hasTargets) return nextRoutePoints;
  return [...targets.slice(0, -1), ...nextRoutePoints];
}

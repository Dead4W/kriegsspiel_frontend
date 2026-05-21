import type { vec2 } from "@/engine/types.ts";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath.ts";

export type ColumnPlanSeedItem = {
  unitId: string;
  startPos: vec2;
};

export type ColumnPlanItem = {
  unitId: string;
  startPos: vec2;
  orderIndex: number;
};

const EPS = 1e-6;

function distance(a: vec2, b: vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function dedupeSequential(points: vec2[]): vec2[] {
  const result: vec2[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) <= EPS) continue;
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

function buildLeaderPath(targets: vec2[], plan: ColumnPlanItem[]): vec2[] {
  if (!plan.length) return [];
  return [{ x: plan[0]!.startPos.x, y: plan[0]!.startPos.y }, ...targets.map((p) => ({ x: p.x, y: p.y }))];
}

function buildCumulativeDistance(path: vec2[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    cumulative.push(cumulative[i - 1]! + distance(path[i - 1]!, path[i]!));
  }
  return cumulative;
}

function interpolateAtDistance(path: vec2[], cumulative: number[], distanceFromStart: number): vec2 {
  if (!path.length) return { x: 0, y: 0 };
  if (distanceFromStart <= EPS) return { x: path[0]!.x, y: path[0]!.y };
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (distanceFromStart >= total - EPS) {
    const tail = path[path.length - 1]!;
    return { x: tail.x, y: tail.y };
  }

  for (let i = 1; i < path.length; i += 1) {
    const segStart = cumulative[i - 1]!;
    const segEnd = cumulative[i]!;
    const segLen = segEnd - segStart;
    if (segLen <= EPS) continue;
    if (distanceFromStart > segEnd + EPS) continue;
    const t = (distanceFromStart - segStart) / segLen;
    const from = path[i - 1]!;
    const to = path[i]!;
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  }

  const tail = path[path.length - 1]!;
  return { x: tail.x, y: tail.y };
}

function collectVerticesBetween(path: vec2[], cumulative: number[], fromDistance: number, toDistance: number): vec2[] {
  if (toDistance <= fromDistance + EPS) return [];
  const vertices: vec2[] = [];
  for (let i = 1; i < path.length - 1; i += 1) {
    const at = cumulative[i]!;
    if (at <= fromDistance + EPS) continue;
    if (at >= toDistance - EPS) continue;
    const vertex = path[i]!;
    vertices.push({ x: vertex.x, y: vertex.y });
  }
  return vertices;
}

export function buildColumnPlanByFirstTargetDistance(
  units: ColumnPlanSeedItem[],
  firstTarget: vec2
): ColumnPlanItem[] {
  if (!units.length) return [];

  const ordered = [...units].sort((a, b) => {
    const distA = Math.hypot(a.startPos.x - firstTarget.x, a.startPos.y - firstTarget.y);
    const distB = Math.hypot(b.startPos.x - firstTarget.x, b.startPos.y - firstTarget.y);
    if (Math.abs(distA - distB) > EPS) return distA - distB;
    return String(a.unitId).localeCompare(String(b.unitId));
  });

  return ordered.map((item, orderIndex) => ({
    unitId: item.unitId,
    startPos: { x: item.startPos.x, y: item.startPos.y },
    orderIndex,
  }));
}

export function getColumnSegmentPointByOrderIndex(
  segIndex: number,
  orderIndex: number,
  targets: vec2[],
  plan: ColumnPlanItem[],
  spacing: number
): vec2[] {
  if (!targets.length || !plan.length || segIndex < 0 || segIndex >= targets.length) return [];
  if (orderIndex <= 0) return [{ x: targets[segIndex]!.x, y: targets[segIndex]!.y }];

  const leaderPath = buildLeaderPath(targets, plan);
  if (leaderPath.length <= 1) return [];
  const cumulative = buildCumulativeDistance(leaderPath);

  // leader target index in leaderPath: +1 because path starts with leader startPos
  const leaderPrevDistance = cumulative[segIndex] ?? 0;
  const leaderCurrDistance = cumulative[segIndex + 1] ?? leaderPrevDistance;

  const offsetDistance = orderIndex * spacing;
  const followerPrevDistance = Math.max(0, leaderPrevDistance - offsetDistance);
  const followerCurrDistance = Math.max(0, leaderCurrDistance - offsetDistance);

  if (followerCurrDistance <= followerPrevDistance + EPS) {
    return [];
  }

  const finalPoint = interpolateAtDistance(leaderPath, cumulative, followerCurrDistance);
  const viaVertices = collectVerticesBetween(
    leaderPath,
    cumulative,
    followerPrevDistance,
    followerCurrDistance
  );
  const result = dedupeSequential([...viaVertices, finalPoint]);
  return result;
}

export function getColumnPosition(
  segIndex: number,
  orderIndex: number,
  routePoints: vec2[],
  plan: ColumnPlanItem[],
  spacing: number
): vec2[] {
  return getColumnSegmentPointByOrderIndex(segIndex, orderIndex, routePoints, plan, spacing);
}

type PathWorld = Parameters<typeof buildRoadTurnRoutePoints>[0];

export function getColumnSegmentRoutePoints(
  world: PathWorld,
  from: vec2,
  to: vec2,
  smartPathEnabled: boolean,
  hasObjectMap: boolean
): vec2[] {
  if (!smartPathEnabled || !hasObjectMap) {
    return [{ x: to.x, y: to.y }];
  }
  return buildRoadTurnRoutePoints(world, from, to);
}

export function mergeColumnFirstSegmentWithSmartPath(
  world: PathWorld,
  from: vec2,
  points: vec2[],
  smartPathEnabled: boolean,
  hasObjectMap: boolean
): vec2[] {
  if (!points.length) return [];
  if (!smartPathEnabled || !hasObjectMap) return points;

  const first = points[0]!;
  const smartPath = getColumnSegmentRoutePoints(world, from, first, smartPathEnabled, hasObjectMap);
  if (!smartPath.length) return points;

  const merged: vec2[] = [];
  const pushDeduped = (p: vec2) => {
    const last = merged[merged.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) <= EPS) return;
    merged.push({ x: p.x, y: p.y });
  };

  for (const p of smartPath) pushDeduped(p);
  for (let i = 1; i < points.length; i += 1) {
    pushDeduped(points[i]!);
  }
  return merged;
}

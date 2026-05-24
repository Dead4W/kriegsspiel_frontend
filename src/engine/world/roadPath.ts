import type { vec2 } from "@/engine/types.ts";
import type { world } from "@/engine/world/world.ts";
import { getEnvMultipliers } from "@/engine/units/modifiers/UnitEnvModifiers.ts";

const SQRT2 = Math.SQRT2;
const MAX_PATH_NODES = 200000;
const BLOCKED_WATER_ENTITIES = new Set(["water", "river"]);
const MIN_POINT_DISTANCE_PX = 10;
const MAX_DIRECTION_DEVIATION_DEG = 4;
const MAX_LATERAL_DEVIATION_PX = 4;
const FINAL_ROUTE_STRAIGHT_DEVIATION_DEG = 4;
const FINAL_ROUTE_STRAIGHT_LATERAL_PX = 2.5;
const ROAD_COST_FACTOR_BY_ENTITY = new Map<string, number>([
  ["good_road", 0.1],
  ["bridge", 0.1],
  ["road", 0.25],
  ["forest", 1.8],
  ["water", 16],
  ["river", 16],
]);
const EMPTY_CELL_COST_FACTOR = 1.5;
const UNKNOWN_ENTITY_COST_FACTOR = 2.0;
const EMPTY_CELL_SPEED_FACTOR = 1.25;
const EMPTY_NEAR_WATER_DANGER_RADIUS_METERS = 100;
const ROAD_ENTITIES = new Set(["good_road", "bridge", "road"]);
const ROAD_EXIT_PENALTY = 8;
const ROAD_ROUTE_NON_ROAD_FACTOR = 3.2;
const ROAD_CENTER_SEARCH_RADIUS_PX = 18;
const ROAD_CENTER_LOCAL_RADIUS_PX = 12;
const MAX_ASTAR_POINT_STEP_METERS = 800;
const THREAT_ZONE_COST_FACTOR = 32;
const PARTIAL_PATH_CHAIN_MAX_ATTEMPTS = 12;
const PARTIAL_PATH_MIN_PROGRESS_PX = 3;
const ENV_BY_ENTITY_CANDIDATES: Array<{ entities: string[]; envIds: string[] }> = [
  { entities: ["good_road"], envIds: ["on_good_road", "in_good_road"] },
  { entities: ["bridge"], envIds: ["on_good_road", "in_good_road"] },
  { entities: ["road"], envIds: ["on_road", "in_road"] },
  { entities: ["forest"], envIds: ["in_forest"] },
  { entities: ["water", "river"], envIds: ["in_water", "on_water", "in_river"] },
];
const FIELD_ENV_FALLBACK_IDS = ["in_field", "in_plain_field", "in_soft_field", "field"];

type GridPoint = { x: number; y: number };

export type RoadPathThreatZone = {
  x: number
  y: number
  radiusPx: number
}

export type BuildRoadTurnRouteOptions = {
  threatZones?: RoadPathThreatZone[]
}

class MinHeap {
  private data: Array<{ node: number; score: number }> = [];

  get size() {
    return this.data.length;
  }

  push(node: number, score: number) {
    this.data.push({ node, score });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): { node: number; score: number } | null {
    if (!this.data.length) return null;
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.data[parent]!.score <= this.data[index]!.score) break;
      const tmp = this.data[parent]!;
      this.data[parent] = this.data[index]!;
      this.data[index] = tmp;
      index = parent;
    }
  }

  private bubbleDown(index: number) {
    const len = this.data.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < len && this.data[left]!.score < this.data[smallest]!.score) {
        smallest = left;
      }
      if (right < len && this.data[right]!.score < this.data[smallest]!.score) {
        smallest = right;
      }
      if (smallest === index) break;

      const tmp = this.data[index]!;
      this.data[index] = this.data[smallest]!;
      this.data[smallest] = tmp;
      index = smallest;
    }
  }
}

function roundedPoint(pos: vec2): GridPoint {
  return {
    x: Math.round(pos.x),
    y: Math.round(pos.y),
  };
}

function clampPoint(p: GridPoint, width: number, height: number): GridPoint {
  return {
    x: Math.max(0, Math.min(width - 1, p.x)),
    y: Math.max(0, Math.min(height - 1, p.y)),
  };
}

function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function toPoint(index: number, width: number): GridPoint {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getEntityAtPixel(w: world, x: number, y: number): string | null {
  return w.getObjectMapEntityAt({ x, y });
}

function buildSpeedLookup(): {
  getCellSpeedMultiplier: (entity: string | null) => number;
  getMaxSpeedMultiplier: () => number;
} {
  const envMultipliers = getEnvMultipliers();
  const envSpeed = new Map<string, number>();
  let maxSpeed = 1;

  for (const [envId, mult] of Object.entries(envMultipliers)) {
    const speed = Number(mult?.speed);
    if (!Number.isFinite(speed) || speed <= 0) continue;
    envSpeed.set(envId, speed);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  const speedByEntity = new Map<string, number>();
  for (const item of ENV_BY_ENTITY_CANDIDATES) {
    let speed = 1;
    for (const envId of item.envIds) {
      const envValue = envSpeed.get(envId);
      if (envValue != null) {
        speed = envValue;
        break;
      }
    }
    for (const entity of item.entities) {
      speedByEntity.set(entity, speed);
    }
  }

  let fieldSpeed = 1;
  for (const envId of FIELD_ENV_FALLBACK_IDS) {
    const envValue = envSpeed.get(envId);
    if (envValue != null) {
      fieldSpeed = envValue;
      break;
    }
  }
  if (fieldSpeed > maxSpeed) maxSpeed = fieldSpeed;
  const emptyCellSpeed = Math.max(0.05, fieldSpeed * EMPTY_CELL_SPEED_FACTOR);

  return {
    getCellSpeedMultiplier(entity: string | null): number {
      if (!entity) return emptyCellSpeed;
      return speedByEntity.get(entity) ?? fieldSpeed;
    },
    getMaxSpeedMultiplier(): number {
      return Math.max(0.001, maxSpeed);
    },
  };
}

function getTraversableCellCost(
  fromEntity: string | null,
  toEntity: string | null,
  stepDistance: number,
  speedResolver: (entity: string | null) => number,
  preferRoadRoute: boolean,
  dangerousEmptyNearWater = false
): number {
  if (toEntity && BLOCKED_WATER_ENTITIES.has(toEntity)) return Infinity;
  const speed = speedResolver(toEntity);
  if (!Number.isFinite(speed) || speed <= 0) return Infinity;

  const waterRoadFactor = ROAD_COST_FACTOR_BY_ENTITY.get("water") ?? EMPTY_CELL_COST_FACTOR;
  let roadFactor = !toEntity
    ? (dangerousEmptyNearWater ? waterRoadFactor : EMPTY_CELL_COST_FACTOR)
    : (ROAD_COST_FACTOR_BY_ENTITY.get(toEntity) ?? UNKNOWN_ENTITY_COST_FACTOR);

  if (preferRoadRoute && (!toEntity || !ROAD_ENTITIES.has(toEntity))) {
    roadFactor *= ROAD_ROUTE_NON_ROAD_FACTOR;
  }

  const fromIsRoad = Boolean(fromEntity && ROAD_ENTITIES.has(fromEntity));
  const toIsRoad = Boolean(toEntity && ROAD_ENTITIES.has(toEntity));
  const exitRoadPenalty = fromIsRoad && !toIsRoad ? ROAD_EXIT_PENALTY : 0;

  return (stepDistance / speed) * roadFactor + exitRoadPenalty;
}

function findPathAStarWithEnvironmentSpeed(
  w: world,
  start: GridPoint,
  goal: GridPoint,
  options: BuildRoadTurnRouteOptions = {}
): GridPoint[] | null {
  const width = w.map.width;
  const height = w.map.height;
  const startIdx = toIndex(start.x, start.y, width);
  const goalIdx = toIndex(goal.x, goal.y, width);
  const speedLookup = buildSpeedLookup();
  const minCostPerPx = 1 / speedLookup.getMaxSpeedMultiplier();
  const threatZones = (options.threatZones ?? [])
    .filter((zone) => Number.isFinite(zone.radiusPx) && zone.radiusPx > 0)
    .map((zone) => ({ x: zone.x, y: zone.y, radiusPx: zone.radiusPx }))

  const getThreatCost = (x: number, y: number): number => {
    if (!threatZones.length) return 0
    let penalty = 0
    for (const zone of threatZones) {
      const dx = x - zone.x
      const dy = y - zone.y
      const dist = Math.hypot(dx, dy)
      if (dist >= zone.radiusPx) continue
      const ratio = 1 - (dist / zone.radiusPx)
      penalty += ratio * THREAT_ZONE_COST_FACTOR
    }
    return penalty
  }

  const openHeap = new MinHeap();
  const gScore = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const entityCache = new Map<number, string | null>();
  let bestIdx = startIdx;
  let bestDistanceToGoal = distance(start, goal);

  const reconstructPath = (targetIdx: number): GridPoint[] | null => {
    const path: GridPoint[] = [];
    let walk = targetIdx;
    while (true) {
      path.push(toPoint(walk, width));
      const prev = parent.get(walk);
      if (prev == null) break;
      walk = prev;
    }
    path.reverse();
    return path.length > 1 ? path : null;
  };

  const getEntityByIndex = (idx: number): string | null => {
    const cached = entityCache.get(idx);
    if (cached !== undefined) return cached;
    const point = toPoint(idx, width);
    const entity = getEntityAtPixel(w, point.x, point.y);
    entityCache.set(idx, entity);
    return entity;
  };

  const metersPerPixel = Math.max(0.0001, Number(w.map.metersPerPixel) || 1);
  const dangerousEmptyRadiusPx = EMPTY_NEAR_WATER_DANGER_RADIUS_METERS / metersPerPixel;
  const dangerousEmptyRadiusSq = dangerousEmptyRadiusPx * dangerousEmptyRadiusPx;
  const dangerousEmptyCache = new Map<number, boolean>();
  const isDangerousEmptyNearWater = (idx: number): boolean => {
    if (dangerousEmptyRadiusPx <= 0) return false;
    const cached = dangerousEmptyCache.get(idx);
    if (cached !== undefined) return cached;

    if (getEntityByIndex(idx)) {
      dangerousEmptyCache.set(idx, false);
      return false;
    }

    const point = toPoint(idx, width);
    const searchRadius = Math.ceil(dangerousEmptyRadiusPx);
    const minX = Math.max(0, point.x - searchRadius);
    const maxX = Math.min(width - 1, point.x + searchRadius);
    const minY = Math.max(0, point.y - searchRadius);
    const maxY = Math.min(height - 1, point.y + searchRadius);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - point.x;
        const dy = y - point.y;
        if ((dx * dx) + (dy * dy) > dangerousEmptyRadiusSq) continue;
        const entity = getEntityByIndex(toIndex(x, y, width));
        if (entity && BLOCKED_WATER_ENTITIES.has(entity)) {
          dangerousEmptyCache.set(idx, true);
          return true;
        }
      }
    }

    dangerousEmptyCache.set(idx, false);
    return false;
  };

  const startEntity = getEntityByIndex(startIdx);
  const goalEntity = getEntityByIndex(goalIdx);
  const preferRoadRoute = Boolean(
    startEntity
    && goalEntity
    && ROAD_ENTITIES.has(startEntity)
    && ROAD_ENTITIES.has(goalEntity)
  );
  if (
    (startEntity && BLOCKED_WATER_ENTITIES.has(startEntity))
    || (goalEntity && BLOCKED_WATER_ENTITIES.has(goalEntity))
  ) {
    return null;
  }

  gScore.set(startIdx, 0);
  openHeap.push(startIdx, distance(start, goal) * minCostPerPx);

  let visited = 0;
  const neighbors = [
    { dx: 1, dy: 0, cost: 1 },
    { dx: -1, dy: 0, cost: 1 },
    { dx: 0, dy: 1, cost: 1 },
    { dx: 0, dy: -1, cost: 1 },
    { dx: 1, dy: 1, cost: SQRT2 },
    { dx: 1, dy: -1, cost: SQRT2 },
    { dx: -1, dy: 1, cost: SQRT2 },
    { dx: -1, dy: -1, cost: SQRT2 },
  ];

  while (openHeap.size > 0) {
    const current = openHeap.pop();
    if (!current) break;
    const currentIdx = current.node;
    if (closed.has(currentIdx)) continue;
    const currentPoint = toPoint(currentIdx, width);
    const currentDistanceToGoal = distance(currentPoint, goal);
    if (currentDistanceToGoal < bestDistanceToGoal) {
      bestDistanceToGoal = currentDistanceToGoal;
      bestIdx = currentIdx;
    }

    if (currentIdx === goalIdx) {
      return reconstructPath(currentIdx);
    }

    closed.add(currentIdx);
    visited += 1;
    if (visited > MAX_PATH_NODES) {
      return reconstructPath(bestIdx);
    }

    const currentG = gScore.get(currentIdx) ?? Infinity;
    const currentEntity = getEntityByIndex(currentIdx);

    for (const n of neighbors) {
      const nx = currentPoint.x + n.dx;
      const ny = currentPoint.y + n.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

      const neighborIdx = toIndex(nx, ny, width);
      if (closed.has(neighborIdx)) continue;
      const neighborEntity = getEntityByIndex(neighborIdx);
      const stepCost = getTraversableCellCost(
        currentEntity,
        neighborEntity,
        n.cost,
        speedLookup.getCellSpeedMultiplier,
        preferRoadRoute,
        isDangerousEmptyNearWater(neighborIdx)
      );
      if (!Number.isFinite(stepCost)) continue;

      const tentative = currentG + stepCost;
      const threatCost = getThreatCost(nx, ny)
      const weightedTentative = tentative + threatCost
      if (weightedTentative >= (gScore.get(neighborIdx) ?? Infinity)) continue;

      parent.set(neighborIdx, currentIdx);
      gScore.set(neighborIdx, weightedTentative);
      const heuristic = distance({ x: nx, y: ny }, goal) * minCostPerPx;
      const f = weightedTentative + heuristic;
      openHeap.push(neighborIdx, f);
    }
  }

  return reconstructPath(bestIdx);
}

function toTurnPoints(path: GridPoint[]): vec2[] {
  if (path.length <= 1) return path.map((p) => ({ x: p.x, y: p.y }));

  const turns: vec2[] = [];
  let prevDirX = path[1]!.x - path[0]!.x;
  let prevDirY = path[1]!.y - path[0]!.y;

  for (let i = 2; i < path.length; i += 1) {
    const dx = path[i]!.x - path[i - 1]!.x;
    const dy = path[i]!.y - path[i - 1]!.y;
    if (dx !== prevDirX || dy !== prevDirY) {
      const turn = path[i - 1]!;
      turns.push({ x: turn.x, y: turn.y });
      prevDirX = dx;
      prevDirY = dy;
    }
  }

  const last = path[path.length - 1]!;
  turns.push({ x: last.x, y: last.y });
  return turns;
}

function isRoadEntity(entity: string | null): boolean {
  return Boolean(entity && ROAD_ENTITIES.has(entity));
}

function isRoadIntersectionPoint(w: world, point: GridPoint): boolean {
  const centerEntity = getEntityAtPixel(w, point.x, point.y);
  if (!isRoadEntity(centerEntity)) return false;

  const north = isRoadEntity(getEntityAtPixel(w, point.x, point.y - 1));
  const south = isRoadEntity(getEntityAtPixel(w, point.x, point.y + 1));
  const west = isRoadEntity(getEntityAtPixel(w, point.x - 1, point.y));
  const east = isRoadEntity(getEntityAtPixel(w, point.x + 1, point.y));

  const degree = Number(north) + Number(south) + Number(west) + Number(east);
  const hasVertical = north || south;
  const hasHorizontal = west || east;

  // Keep anchors for T/X style intersections.
  return degree >= 3 && hasVertical && hasHorizontal;
}

function resolveNearestRoadGridPoint(w: world, point: vec2): GridPoint | null {
  const nearestRoad = w.findNearestObjectPoint(
    point,
    ["good_road", "bridge", "road"],
    Math.max(2, ROAD_CENTER_LOCAL_RADIUS_PX)
  );
  if (!nearestRoad) return null;
  return {
    x: Math.round(nearestRoad.x),
    y: Math.round(nearestRoad.y),
  };
}

function collectRoadIntersectionAnchors(w: world, centeredPath: vec2[]): vec2[] {
  if (centeredPath.length < 3) return [];
  const anchors: vec2[] = [];
  let lastAnchor: vec2 | null = null;

  for (let i = 1; i < centeredPath.length - 1; i += 1) {
    const point = centeredPath[i]!;
    const gridPoint = resolveNearestRoadGridPoint(w, point);
    if (!gridPoint) continue;
    if (!isRoadIntersectionPoint(w, gridPoint)) continue;
    const centered = snapPointsToRoadCenters(w, [point])[0] ?? point;
    const anchor = { x: centered.x, y: centered.y };
    if (!lastAnchor) {
      anchors.push(anchor);
      lastAnchor = anchor;
      continue;
    }
    if (Math.hypot(anchor.x - lastAnchor.x, anchor.y - lastAnchor.y) >= MIN_POINT_DISTANCE_PX) {
      anchors.push(anchor);
      lastAnchor = anchor;
    }
  }

  return anchors;
}

function nearestPathIndex(path: vec2[], point: vec2): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i]!;
    const dist = Math.hypot(point.x - p.x, point.y - p.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function mergePointsByPathProgress(path: vec2[], points: vec2[]): vec2[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => nearestPathIndex(path, a) - nearestPathIndex(path, b));
  return dedupeSequential(sorted);
}

function segmentAngle(from: vec2, to: vec2): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
}

function normalizeAngleDelta(value: number): number {
  const tau = Math.PI * 2;
  let angle = value % tau;
  if (angle > Math.PI) angle -= tau;
  if (angle < -Math.PI) angle += tau;
  return angle;
}

function simplifyByDirectionTolerance(points: vec2[], maxDeviationDeg = MAX_DIRECTION_DEVIATION_DEG): vec2[] {
  if (points.length <= 2) return [...points];

  const result: vec2[] = [points[0]!];
  const maxDeviationRad = (maxDeviationDeg * Math.PI) / 180;

  let anchor = points[0]!;
  let prev = points[1]!;
  let referenceAngle = segmentAngle(anchor, prev);

  for (let i = 2; i < points.length; i += 1) {
    const current = points[i]!;
    const currentAngle = segmentAngle(anchor, current);

    if (referenceAngle == null && currentAngle != null) {
      referenceAngle = currentAngle;
      prev = current;
      continue;
    }
    if (referenceAngle == null || currentAngle == null) {
      prev = current;
      continue;
    }

    const deviation = Math.abs(normalizeAngleDelta(currentAngle - referenceAngle));
    if (deviation > maxDeviationRad) {
      result.push(prev);
      anchor = prev;
      referenceAngle = segmentAngle(anchor, current);
    }
    prev = current;
  }

  result.push(points[points.length - 1]!);
  return result;
}

function perpendicularDistanceToSegment(point: vec2, from: vec2, to: vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  const projX = from.x + dx * clampedT;
  const projY = from.y + dy * clampedT;
  return Math.hypot(point.x - projX, point.y - projY);
}

function simplifyByLateralDeviation(
  points: vec2[],
  maxLateralDeviationPx = MAX_LATERAL_DEVIATION_PX
): vec2[] {
  if (points.length <= 2) return [...points];
  const out: vec2[] = [points[0]!];
  let anchorIdx = 0;

  for (let i = 2; i < points.length; i += 1) {
    const anchor = points[anchorIdx]!;
    const candidate = points[i]!;
    let maxDeviation = 0;
    for (let j = anchorIdx + 1; j < i; j += 1) {
      const p = points[j]!;
      const deviation = perpendicularDistanceToSegment(p, anchor, candidate);
      if (deviation > maxDeviation) maxDeviation = deviation;
      if (maxDeviation > maxLateralDeviationPx) break;
    }

    if (maxDeviation > maxLateralDeviationPx) {
      const prev = points[i - 1]!;
      out.push(prev);
      anchorIdx = i - 1;
    }
  }

  out.push(points[points.length - 1]!);
  return out;
}

function enforceMinPointDistance(points: vec2[], minDistancePx = MIN_POINT_DISTANCE_PX): vec2[] {
  if (points.length <= 2) return [...points];
  const out: vec2[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = out[out.length - 1]!;
    const p = points[i]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) < minDistancePx) {
      continue;
    }
    out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function snapPointsToRoadCenters(w: world, points: vec2[]): vec2[] {
  return points.map((p) => {
    const nearestRoad = w.findNearestObjectPoint(
      p,
      ["good_road", "bridge", "road"],
      ROAD_CENTER_SEARCH_RADIUS_PX
    );
    if (!nearestRoad) return p;
    const nearestRoadDist = Math.hypot(nearestRoad.x - p.x, nearestRoad.y - p.y);
    if (nearestRoadDist > ROAD_CENTER_SEARCH_RADIUS_PX) return p;

    const localCenter = w.findNearestObjectLocalCenter(
      p,
      ["good_road", "bridge", "road"],
      ROAD_CENTER_SEARCH_RADIUS_PX,
      ROAD_CENTER_LOCAL_RADIUS_PX
    )?.center;
    if (!localCenter) return p;
    return {
      x: localCenter.x,
      y: localCenter.y,
    };
  });
}

function simplifyTurnPoints(w: world, points: vec2[]): vec2[] {
  if (points.length <= 2) return [...points];
  const directional = simplifyByDirectionTolerance(points, MAX_DIRECTION_DEVIATION_DEG);
  const geometric = simplifyByLateralDeviation(directional, MAX_LATERAL_DEVIATION_PX);
  const sparse = enforceMinPointDistance(geometric, MIN_POINT_DISTANCE_PX);
  const snapped = snapPointsToRoadCenters(w, sparse);
  return enforceMinPointDistance(snapped, MIN_POINT_DISTANCE_PX);
}

function dedupeSequential(points: vec2[]): vec2[] {
  const result: vec2[] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    result.push({ x: p.x, y: p.y });
  }
  return result;
}

function enforceMaxStepDistance(points: vec2[], maxStepPx: number): vec2[] {
  if (points.length <= 1 || !Number.isFinite(maxStepPx) || maxStepPx <= 0) {
    return points.map((p) => ({ x: p.x, y: p.y }));
  }

  const result: vec2[] = [];
  let prev = points[0]!;
  result.push({ x: prev.x, y: prev.y });

  for (let i = 1; i < points.length; i += 1) {
    const current = points[i]!;
    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    const dist = Math.hypot(dx, dy);

    if (dist > maxStepPx) {
      const chunks = Math.ceil(dist / maxStepPx);
      for (let j = 1; j < chunks; j += 1) {
        const t = j / chunks;
        result.push({
          x: prev.x + dx * t,
          y: prev.y + dy * t,
        });
      }
    }

    result.push({ x: current.x, y: current.y });
    prev = current;
  }

  return dedupeSequential(result);
}

function collapseStraightRuns(
  points: vec2[],
  maxDeviationDeg = FINAL_ROUTE_STRAIGHT_DEVIATION_DEG,
  maxLateralPx = FINAL_ROUTE_STRAIGHT_LATERAL_PX
): vec2[] {
  if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }));

  const out: vec2[] = [points[0]!];
  const maxDeviationRad = (maxDeviationDeg * Math.PI) / 180;

  let anchor = points[0]!;
  let last = points[1]!;
  let referenceAngle = segmentAngle(anchor, last);

  for (let i = 2; i < points.length; i += 1) {
    const current = points[i]!;
    const currentAngle = segmentAngle(anchor, current);

    if (referenceAngle == null || currentAngle == null) {
      out.push(last);
      anchor = last;
      last = current;
      referenceAngle = segmentAngle(anchor, last);
      continue;
    }

    const deviation = Math.abs(normalizeAngleDelta(currentAngle - referenceAngle));
    const lateral = perpendicularDistanceToSegment(last, anchor, current);
    const shouldKeepStraightRun = deviation <= maxDeviationRad && lateral <= maxLateralPx;

    if (shouldKeepStraightRun) {
      last = current;
      continue;
    }

    out.push(last);
    anchor = last;
    last = current;
    referenceAngle = segmentAngle(anchor, last);
  }

  out.push(points[points.length - 1]!);
  return dedupeSequential(out);
}

/**
 * Builds move segment points (excluding "from") by A* pathfinding.
 * Tries to chain partial A* results when goal cannot be reached in one pass.
 * Uses environment speed multipliers from object-map entities.
 * Water cells are treated as blocked.
 */
export function buildRoadTurnRoutePoints(
  w: world,
  from: vec2,
  to: vec2,
  options: BuildRoadTurnRouteOptions = {}
): vec2[] {
  const startedAt = (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
  const threatZonesCount = options.threatZones?.length ?? 0;
  if (!w.objectMapImageData || w.objectMapColorToEntity.size === 0) {
    console.debug("[RoadPathPerf] object_map_unavailable_fallback", {
      durationMs: 0,
      threatZones: threatZonesCount,
    });
    return [{ x: to.x, y: to.y }];
  }

  const width = w.map.width;
  const height = w.map.height;
  const fromPx = clampPoint(roundedPoint(from), width, height);
  const toPx = clampPoint(roundedPoint(to), width, height);

  const chainedPath: GridPoint[] = [{ x: fromPx.x, y: fromPx.y }];
  let chainCursor = { x: fromPx.x, y: fromPx.y };
  let reachedGoal = false;
  let attemptsUsed = 0;

  for (let attempt = 0; attempt < PARTIAL_PATH_CHAIN_MAX_ATTEMPTS; attempt += 1) {
    attemptsUsed += 1;
    const partial = findPathAStarWithEnvironmentSpeed(w, chainCursor, toPx, options);
    if (!partial || partial.length < 2) break;

    for (let i = 1; i < partial.length; i += 1) {
      chainedPath.push(partial[i]!);
    }

    const tail = partial[partial.length - 1]!;
    if (tail.x === toPx.x && tail.y === toPx.y) {
      reachedGoal = true;
      break;
    }

    const progress = distance(chainCursor, tail);
    if (!Number.isFinite(progress) || progress < PARTIAL_PATH_MIN_PROGRESS_PX) {
      break;
    }
    chainCursor = { x: tail.x, y: tail.y };
  }

  if (chainedPath.length < 2) {
    const durationMs = ((typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now()
      : Date.now()) - startedAt;
    console.debug("[RoadPathPerf] no_path_fallback", {
      durationMs,
      attemptsUsed,
      reachedGoal,
      threatZones: threatZonesCount,
    });
    return [{ x: to.x, y: to.y }];
  }

  const path = dedupeSequential(chainedPath);
  const centeredPath = snapPointsToRoadCenters(
    w,
    path.map((p) => ({ x: p.x, y: p.y }))
  );
  const turnPoints = simplifyTurnPoints(w, toTurnPoints(path));
  const mandatoryAnchors = collectRoadIntersectionAnchors(w, centeredPath);
  const orderedTurnPoints = mandatoryAnchors.length
    ? mergePointsByPathProgress(centeredPath, [...turnPoints, ...mandatoryAnchors])
    : turnPoints;
  const centeredTurnPoints = enforceMinPointDistance(
    snapPointsToRoadCenters(w, orderedTurnPoints),
    MIN_POINT_DISTANCE_PX
  );
  const result: vec2[] = [];
  for (const p of centeredTurnPoints) {
    result.push({ x: p.x, y: p.y });
  }

  if (reachedGoal) {
    result.push({ x: to.x, y: to.y });
  }

  const preprocessed = collapseStraightRuns(dedupeSequential(result));
  const metersPerPixel = Math.max(0.0001, Number(w.map.metersPerPixel) || 1);
  const maxStepPx = MAX_ASTAR_POINT_STEP_METERS / metersPerPixel;
  const withStepLimit = enforceMaxStepDistance(preprocessed, maxStepPx);
  const deduped = dedupeSequential(withStepLimit);
  if (!deduped.length) {
    if (reachedGoal) return [{ x: to.x, y: to.y }];
    const tail = path[path.length - 1]!;
    return [{ x: tail.x, y: tail.y }];
  }
  const durationMs = ((typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now()) - startedAt;
  console.debug("[RoadPathPerf] build_route", {
    durationMs,
    attemptsUsed,
    reachedGoal,
    threatZones: threatZonesCount,
    from: { x: fromPx.x, y: fromPx.y },
    to: { x: toPx.x, y: toPx.y },
    chainedPathPoints: chainedPath.length,
    finalPoints: deduped.length,
  });
  return deduped;
}

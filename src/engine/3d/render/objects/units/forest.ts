import type { BaseUnit } from '@/engine/units/baseUnit'

type ForestPlacementPoint = {
  px: number
  py: number
}

export type ForestPlacementLookup = {
  points: ForestPlacementPoint[]
  buckets: Map<string, number[]>
  bucketSizePx: number
}

type ResolveForestWorldPositionArgs = {
  unit: BaseUnit
  lookup: ForestPlacementLookup
  mapHalfWidth: number
  mapHalfHeight: number
  metersPerPixel: number
}

function hashString01(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function toPointKey(px: number, py: number) {
  return `${Math.round(px)},${Math.round(py)}`
}

function toBucketKey(px: number, py: number, bucketSizePx: number) {
  const bx = Math.floor(px / bucketSizePx)
  const by = Math.floor(py / bucketSizePx)
  return `${bx},${by}`
}

function searchClosestForestPoint(
  targetPx: number,
  targetPy: number,
  lookup: ForestPlacementLookup,
  maxSearchRadiusPx: number
) {
  const { buckets, bucketSizePx, points } = lookup
  if (!points.length) return null
  const bucketRadius = Math.max(1, Math.ceil(maxSearchRadiusPx / Math.max(1, bucketSizePx)))
  const centerBx = Math.floor(targetPx / bucketSizePx)
  const centerBy = Math.floor(targetPy / bucketSizePx)
  const maxDistanceSq = maxSearchRadiusPx * maxSearchRadiusPx
  let bestIndex = -1
  let bestDistanceSq = Number.POSITIVE_INFINITY

  for (let dy = -bucketRadius; dy <= bucketRadius; dy += 1) {
    for (let dx = -bucketRadius; dx <= bucketRadius; dx += 1) {
      const key = `${centerBx + dx},${centerBy + dy}`
      const bucket = buckets.get(key)
      if (!bucket) continue
      for (let i = 0; i < bucket.length; i += 1) {
        const index = bucket[i]!
        const point = points[index]!
        const offsetX = point.px - targetPx
        const offsetY = point.py - targetPy
        const distSq = offsetX * offsetX + offsetY * offsetY
        if (distSq > maxDistanceSq) continue
        if (distSq < bestDistanceSq) {
          bestDistanceSq = distSq
          bestIndex = index
        }
      }
    }
  }

  if (bestIndex < 0) return null
  return points[bestIndex]!
}

export function hasForestEnvironment(unit: BaseUnit) {
  if (Array.isArray(unit.envState)) {
    if (unit.envState.includes('in_forest')) return true
  }
  const dynamicEnvironment = (
    unit as { environment?: { in_forest?: unknown } }
  ).environment
  return Boolean(dynamicEnvironment?.in_forest)
}

export function createForestPlacementLookup(
  forestPoints: Array<[number, number]>,
  treePoints: Array<[number, number]>
): ForestPlacementLookup | null {
  if (!forestPoints.length) return null
  const blocked = new Set<string>()
  const treeClearanceRadiusPx = 2
  for (let i = 0; i < treePoints.length; i += 1) {
    const [px, py] = treePoints[i]!
    const cx = Math.round(px)
    const cy = Math.round(py)
    for (let dy = -treeClearanceRadiusPx; dy <= treeClearanceRadiusPx; dy += 1) {
      for (let dx = -treeClearanceRadiusPx; dx <= treeClearanceRadiusPx; dx += 1) {
        if (dx * dx + dy * dy > treeClearanceRadiusPx * treeClearanceRadiusPx) continue
        blocked.add(toPointKey(cx + dx, cy + dy))
      }
    }
  }

  const unique = new Set<string>()
  const points: ForestPlacementPoint[] = []
  for (let i = 0; i < forestPoints.length; i += 1) {
    const [px, py] = forestPoints[i]!
    const key = toPointKey(px, py)
    if (blocked.has(key) || unique.has(key)) continue
    unique.add(key)
    points.push({ px: Math.round(px), py: Math.round(py) })
  }
  if (!points.length) return null

  const bucketSizePx = 8
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!
    const key = toBucketKey(point.px, point.py, bucketSizePx)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(i)
    } else {
      buckets.set(key, [i])
    }
  }
  return { points, buckets, bucketSizePx }
}

export function resolveForestUnitWorldPosition({
  unit,
  lookup,
  mapHalfWidth,
  mapHalfHeight,
  metersPerPixel,
}: ResolveForestWorldPositionArgs) {
  const spreadMeters = Math.max(metersPerPixel * 6, 7.5)
  const spreadPx = spreadMeters / Math.max(0.001, metersPerPixel)
  const offsetX = (hashString01(`${unit.id}:forest:x`) - 0.5) * spreadPx * 2
  const offsetY = (hashString01(`${unit.id}:forest:y`) - 0.5) * spreadPx * 2
  const targetPx = Number(unit.pos.x) + offsetX
  const targetPy = Number(unit.pos.y) + offsetY

  const maxSearchRadiusPx = Math.max(8, spreadPx * 1.8)
  const point = searchClosestForestPoint(targetPx, targetPy, lookup, maxSearchRadiusPx)
  if (!point) return null

  return {
    x: (point.px - mapHalfWidth) * metersPerPixel,
    z: (point.py - mapHalfHeight) * metersPerPixel,
  }
}

import type { vec2 } from '@/engine/types'
import { buildRoadTurnRoutePoints } from '@/engine/world/roadPath'

function nearestPointIndex(from: vec2, points: vec2[]): number {
  if (!points.length) return -1
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i]!.x - from.x
    const dy = points[i]!.y - from.y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

export function buildMessengerRouteByNearestPoints(
  start: vec2,
  waypoints: vec2[]
): vec2[] {
  if (!waypoints.length) return []
  const pending = waypoints.map((p) => ({ x: p.x, y: p.y }))
  let current = { x: start.x, y: start.y }
  const route: vec2[] = []

  while (pending.length > 0) {
    const idx = nearestPointIndex(current, pending)
    if (idx < 0) break
    const target = pending.splice(idx, 1)[0]!
    const segment = buildRoadTurnRoutePoints(window.ROOM_WORLD, current, target)
    if (segment.length > 0) {
      route.push(...segment.map((p) => ({ x: p.x, y: p.y })))
      current = route[route.length - 1]!
      continue
    }
    route.push({ x: target.x, y: target.y })
    current = target
  }

  return route
}


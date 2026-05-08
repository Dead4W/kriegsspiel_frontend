import type { BaseUnit } from '@/engine/units/baseUnit'
import type { BuildingAnchor } from '../buildings'

type UnitHouseBinding = {
  anchor: BuildingAnchor
  unit: BaseUnit
}

export type { UnitHouseBinding }

function hasHouseEnvironment(unit: BaseUnit) {
  if (Array.isArray(unit.envState)) {
    if (unit.envState.includes('in_house')) return true
    if (unit.envState.includes('in_cover_house')) return true
  }
  const dynamicEnvironment = (
    unit as { environment?: { in_house?: unknown; in_cover_house?: unknown } }
  ).environment
  return Boolean(dynamicEnvironment?.in_house || dynamicEnvironment?.in_cover_house)
}

export function resolveHouseOccupancy(
  units: BaseUnit[],
  anchors: BuildingAnchor[],
  mapHalfWidth: number,
  mapHalfHeight: number,
  metersPerPixel: number
) {
  const maxSearchDistanceMeters = Math.max(1, metersPerPixel * 30)
  const maxSearchDistanceSq = maxSearchDistanceMeters * maxSearchDistanceMeters
  const candidates: Array<{ unit: BaseUnit; x: number; z: number }> = []
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i]!
    const hp = Number(unit.hp)
    if (!Number.isFinite(hp) || hp <= 0) continue
    if (!hasHouseEnvironment(unit)) continue
    candidates.push({
      unit,
      x: (unit.pos.x - mapHalfWidth) * metersPerPixel,
      z: (unit.pos.y - mapHalfHeight) * metersPerPixel,
    })
  }
  if (!candidates.length) return new Map<string, UnitHouseBinding>()

  const freeAnchors = new Set<string>()
  const anchorsById = new Map<string, BuildingAnchor>()
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i]!
    freeAnchors.add(anchor.id)
    anchorsById.set(anchor.id, anchor)
  }

  const bindings = new Map<string, UnitHouseBinding>()
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]!
    let bestAnchorId: string | null = null
    let bestDistSq = Number.POSITIVE_INFINITY
    for (const anchorId of freeAnchors) {
      const anchor = anchorsById.get(anchorId)
      if (!anchor) continue
      const dx = anchor.x - candidate.x
      const dz = anchor.z - candidate.z
      const distSq = dx * dx + dz * dz
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestAnchorId = anchorId
      }
    }
    if (bestAnchorId && bestDistSq <= maxSearchDistanceSq) {
      const assigned = anchorsById.get(bestAnchorId)
      if (assigned) {
        bindings.set(candidate.unit.id, { anchor: assigned, unit: candidate.unit })
        freeAnchors.delete(bestAnchorId)
        continue
      }
    }
    // Approximate regular building preset (floors=2, floorHeight=1.35*objectSize),
    // then scale up by 1.5x as requested.
    const virtualAnchor: BuildingAnchor = {
      id: `virtual:${candidate.unit.id}`,
      x: candidate.x,
      z: candidate.z,
      footprintX: Math.max(metersPerPixel * 6.3, 1.8),
      footprintZ: Math.max(metersPerPixel * 6.3, 1.8),
      bodyHeight: Math.max(metersPerPixel * 4.05, 1.4),
      isVirtual: true,
    }
    bindings.set(candidate.unit.id, { anchor: virtualAnchor, unit: candidate.unit })
  }

  return bindings
}

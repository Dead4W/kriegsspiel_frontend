// UnitDistanceModifier.ts

import { getResourcePack } from "@/engine/assets/resourcepack.ts";

export interface DistanceModifierPoint {
  distance: number
  modifier: number
}

function cleanDistanceTable(raw: unknown): DistanceModifierPoint[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const cleaned = raw
    .map((x) => ({
      distance: Number((x as any)?.distance),
      modifier: Number((x as any)?.modifier),
    }))
    .filter((x) => Number.isFinite(x.distance) && x.distance >= 0 && Number.isFinite(x.modifier) && x.modifier > 0)
    .sort((a, b) => a.distance - b.distance)

  return cleaned.length ? cleaned : []
}

/**
 * Fetch distance modifier table by key from resourcepack.
 * Allows multiple type-specific tables: e.g. "default", "artillery", "cavalry", etc.
 */
export function getDistanceModifiersTable(key: string): DistanceModifierPoint[] {
  const table = getResourcePack()?.distanceModifiers?.[key]
  return cleanDistanceTable(table)
}

export function getUnitDistanceModifier(
  distanceModifiersKey: string,
  distance: number
): number {
  const distanceModifiers = getDistanceModifiersTable(distanceModifiersKey) || getDistanceModifiersTable('default') || []
  if (!distanceModifiers.length) return 1
  const first = distanceModifiers[0]!
  const last = distanceModifiers[distanceModifiers.length - 1]!

  // ближе минимальной дистанции
  if (distance <= first.distance) {
    return first.modifier
  }

  // дальше максимальной дистанции
  if (distance > last.distance) {
    const extraDistance = distance - last.distance
    const steps = Math.floor(extraDistance / 100)
    return last.modifier / Math.pow(2, steps)
  }

  // интерполяция внутри диапазона
  for (let i = 0; i < distanceModifiers.length - 1; i++) {
    const a = distanceModifiers[i]!
    const b = distanceModifiers[i + 1]!

    if (distance >= a.distance && distance <= b.distance) {
      const t = (distance - a.distance) / (b.distance - a.distance)
      return a.modifier + (b.modifier - a.modifier) * t
    }
  }

  return 1
}

// UnitDistanceModifier.ts

export interface DistanceModifierPoint {
  distance: number
  modifier: number
}

export const DISTANCE_MODIFIERS: DistanceModifierPoint[] = [
  { distance: 50, modifier: 1.6 },
  { distance: 100, modifier: 1.5 },
  { distance: 200, modifier: 1.0 },
  { distance: 300, modifier: 0.75 },
  { distance: 400, modifier: 0.55 },
  { distance: 500, modifier: 0.45 },
  { distance: 600, modifier: 0.35 },
  { distance: 700, modifier: 0.27 },
  { distance: 800, modifier: 0.20 },
  { distance: 900, modifier: 0.14 },
  { distance: 1000, modifier: 0.11 },
]

export const ARTILLERY_DISTANCE_MODIFIERS: DistanceModifierPoint[] = [
  { distance: 200, modifier: 1.5 },
  { distance: 400, modifier: 1.2 },
  { distance: 600, modifier: 1.1 },
  { distance: 800, modifier: 1.0 },
  { distance: 1000, modifier: 0.9 },
  { distance: 1200, modifier: 0.8 },
  { distance: 1400, modifier: 0.7 },
  { distance: 1600, modifier: 0.6 },
  { distance: 1800, modifier: 0.5 },
  { distance: 1900, modifier: 0.45 },
  { distance: 2000, modifier: 0.4 },
  { distance: 2100, modifier: 0.35 },
  { distance: 2200, modifier: 0.3 },
  { distance: 2300, modifier: 0.27 },
  { distance: 2400, modifier: 0.24 },
  { distance: 2600, modifier: 0.22 },
  { distance: 2800, modifier: 0.20 },
  { distance: 2900, modifier: 0.18 },
  { distance: 3100, modifier: 0.16 },
  { distance: 3300, modifier: 0.14 },
  { distance: 3500, modifier: 0.12 },
  { distance: 3600, modifier: 0.11 },
  { distance: 3700, modifier: 0.10 },
  { distance: 3800, modifier: 0.09 },
  { distance: 3900, modifier: 0.08 },
  { distance: 4000, modifier: 0.07 },
  { distance: 4200, modifier: 0.06 },
  { distance: 4300, modifier: 0.05 },
  { distance: 4500, modifier: 0.03 },
]

export function getUnitDistanceModifier(distanceModifiers: DistanceModifierPoint[], distance: number): number {
  // ближе минимальной дистанции
  if (distance <= distanceModifiers[0]!.distance) {
    return distanceModifiers[0]!.modifier
  }

  // дальше максимальной дистанции
  const last = distanceModifiers[distanceModifiers.length - 1]
  if (distance >= last!.distance) {
    return last!.modifier
  }

  // поиск диапазона для интерполяции
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

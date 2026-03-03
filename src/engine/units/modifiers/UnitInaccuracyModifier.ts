import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {vec2} from "@/engine";

import { getResourcePack } from "@/engine/assets/resourcepack.ts";

const DEFAULT_HEIGHT_FACTOR = 5.0;
const DEFAULT_DISTANCE_FACTOR = 0.1;

function getInaccuracyFactors(): { heightFactor: number; distanceFactor: number } {
  const cfg = getResourcePack()?.inaccuracy
  const heightFactor = Number((cfg as any)?.heightFactor)
  const distanceFactor = Number((cfg as any)?.distanceFactor)
  return {
    heightFactor: Number.isFinite(heightFactor) ? heightFactor : DEFAULT_HEIGHT_FACTOR,
    distanceFactor: Number.isFinite(distanceFactor) ? distanceFactor : DEFAULT_DISTANCE_FACTOR,
  }
}

export function computeInaccuracyRadius(
  unit: BaseUnit,
  target: vec2,
): number {
  const { heightFactor, distanceFactor } = getInaccuracyFactors()
  const targetHeight = window.ROOM_WORLD.getHeightAt(target)

  const dx = unit.pos.x - target.x
  const dy = unit.pos.y - target.y

  const horizontalDist =
    Math.hypot(dx, dy)
    * window.ROOM_WORLD.map.metersPerPixel
    * distanceFactor;

  const unitHeight = window.ROOM_WORLD.getHeightAt(unit.pos)

  const dh = (unitHeight - targetHeight) * heightFactor

  // 3D расстояние
  return Math.hypot(horizontalDist, dh)
}

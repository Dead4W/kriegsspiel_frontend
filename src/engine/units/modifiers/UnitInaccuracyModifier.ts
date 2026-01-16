import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {vec2} from "@/engine";

const HEIGHT_FACTOR = 5.0;
const DISTANCE_FACTOR = 0.5;

export function computeInaccuracyRadius(
  unit: BaseUnit,
  target: vec2,
): number {
  const heightMap = window.ROOM_WORLD.heightMap

  const targetHeight =
    heightMap?.getHeightAt(target.x, target.y) ?? 0

  const dx = unit.pos.x - target.x
  const dy = unit.pos.y - target.y

  const horizontalDist = Math.hypot(dx, dy) * DISTANCE_FACTOR;

  const unitHeight =
    heightMap?.getHeightAt(unit.pos.x, unit.pos.y) ?? 0

  const dh = (unitHeight - targetHeight) * HEIGHT_FACTOR

  // 3D расстояние
  return Math.hypot(horizontalDist, dh)
}

import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {vec2} from "@/engine";

const HEIGHT_FACTOR = 5.0;
const DISTANCE_FACTOR = 0.5;

export function computeInaccuracyRadius(
  unit: BaseUnit,
  target: vec2,
): number {
  const targetHeight = window.ROOM_WORLD.getHeightAt(target)

  const dx = unit.pos.x - target.x
  const dy = unit.pos.y - target.y

  const horizontalDist =
    Math.hypot(dx, dy)
    * window.ROOM_WORLD.map.metersPerPixel
    * DISTANCE_FACTOR;

  const unitHeight = window.ROOM_WORLD.getHeightAt(unit.pos)

  const dh = (unitHeight - targetHeight) * HEIGHT_FACTOR

  // 3D расстояние
  return Math.hypot(horizontalDist, dh)
}

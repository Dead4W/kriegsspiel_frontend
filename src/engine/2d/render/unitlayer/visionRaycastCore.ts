// Ядро raycast'а обзора. Модуль обязан оставаться свободным от DOM, Vue и
// world: он исполняется и в основном потоке, и внутри воркера.

// Чем дальше участок леса от юнита, тем сильнее он "гасит" луч.
// 0 = как раньше (лес одинаково "плотный" на любой дистанции).
const FOREST_DISTANCE_PENALTY = 3
const HOUSE_DISTANCE_PENALTY = 20
const HOUSE_DISTANCE_PENALTY_WHEN_UNIT_INSIDE = 9

export const ENABLE_HOUSE_RAYCAST_MODIFIER = false

export const FOREST_OCCLUDER_ENTITY = 'forest'
export const HOUSE_OCCLUDER_ENTITIES = new Set([
  'house',
  'building',
  'red_building',
  'cover_house',
  'fortified_house',
  'fortified_building',
])
export const HOUSE_ENVIRONMENT_STATES = new Set([
  'in_house',
  'in_building',
  'in_cover_house',
  'in_fortified_house',
])

export const VISION_RAY_COUNT = 180

const RAY_STEP = 6
const FOREST_ALPHA_THRESHOLD = 200

const OCCLUDER_NONE = 0
const OCCLUDER_FOREST = 1
const OCCLUDER_HOUSE = 2

export type VisionNavMeshZoneSnapshot = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  pixels: Uint8Array | Uint16Array
}

/**
 * Снимок препятствий, пригодный для structuredClone: только числа и typed
 * array'и, никаких ссылок на world. Один и тот же снимок используется
 * сэмплером в основном потоке и в воркере.
 */
export type VisionOccluderField =
  | { kind: 'none' }
  | {
      kind: 'navmesh'
      zones: VisionNavMeshZoneSnapshot[]
      // -1, если на карте нет леса. Ноль занят "пустым" пикселем, поэтому его
      // нельзя использовать как признак отсутствия.
      forestEntityId: number
      // Флаги по entityId вместо Set<string>: сравнение строк в горячем цикле
      // луча стоило дороже самого шага.
      houseEntityFlags: Uint8Array
    }
  | { kind: 'forest'; width: number; height: number; forestMask: Uint8Array }

/** Возвращает один из OCCLUDER_* кодов для пикселя карты. */
export type OccluderSampler = (x: number, y: number) => number

export function createOccluderSampler(field: VisionOccluderField): OccluderSampler {
  if (field.kind === 'navmesh') {
    const { zones, forestEntityId, houseEntityFlags } = field

    return (x, y) => {
      const pixelX = Math.floor(x)
      const pixelY = Math.floor(y)

      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i]!
        if (pixelX < zone.minX || pixelX > zone.maxX) continue
        if (pixelY < zone.minY || pixelY > zone.maxY) continue

        const localX = pixelX - zone.minX
        const localY = pixelY - zone.minY
        const entityId = zone.pixels[localY * zone.width + localX] ?? 0
        if (entityId === forestEntityId) return OCCLUDER_FOREST
        if (houseEntityFlags[entityId]) return OCCLUDER_HOUSE
        return OCCLUDER_NONE
      }

      return OCCLUDER_NONE
    }
  }

  if (field.kind === 'forest') {
    const { width, height, forestMask } = field

    return (x, y) => {
      const pixelX = Math.floor(x)
      const pixelY = Math.floor(y)
      if (pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height) return OCCLUDER_NONE
      return forestMask[pixelY * width + pixelX] ? OCCLUDER_FOREST : OCCLUDER_NONE
    }
  }

  return () => OCCLUDER_NONE
}

export function buildForestMask(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex++) {
    mask[pixelIndex] = (data[pixelIndex * 4 + 3] ?? 0) > FOREST_ALPHA_THRESHOLD ? 1 : 0
  }
  return mask
}

/**
 * Трассирует один луч и пишет его конец в out[outIndex], out[outIndex + 1].
 */
export function castVisionRay(
  sampleOccluder: OccluderSampler,
  originX: number,
  originY: number,
  angle: number,
  maxDist: number,
  unitInsideHouse: boolean,
  out: Float32Array,
  outIndex: number
): void {
  let x = originX
  let y = originY

  if (maxDist > 0) {
    const dx = Math.cos(angle) * RAY_STEP
    const dy = Math.sin(angle) * RAY_STEP
    let dist = 0
    let realDist = 0

    while (dist < maxDist) {
      let iStep = RAY_STEP

      const occluder = sampleOccluder(x, y)
      if (occluder !== OCCLUDER_NONE) {
        if (dist * 2 >= maxDist) break

        let penalty: number
        let softenedByDistance: boolean
        if (occluder === OCCLUDER_FOREST) {
          penalty = FOREST_DISTANCE_PENALTY
          softenedByDistance = true
        } else {
          penalty = unitInsideHouse ? HOUSE_DISTANCE_PENALTY_WHEN_UNIT_INSIDE : HOUSE_DISTANCE_PENALTY
          softenedByDistance = unitInsideHouse
        }

        iStep *= softenedByDistance
          ? 1 + Math.pow(realDist / maxDist, 0.3) * penalty
          : 1 + penalty
      }

      x += dx
      y += dy
      dist += iStep
      realDist += RAY_STEP
    }
  }

  out[outIndex] = x
  out[outIndex + 1] = y
}

export function createVisionPolygonBuffer(): Float32Array {
  return new Float32Array(VISION_RAY_COUNT * 2)
}

export function visionRayAngle(rayIndex: number): number {
  return (rayIndex / VISION_RAY_COUNT) * Math.PI * 2
}

export function buildVisionPolygonPoints(
  sampleOccluder: OccluderSampler,
  originX: number,
  originY: number,
  maxRange: number,
  unitInsideHouse: boolean
): Float32Array {
  const points = createVisionPolygonBuffer()
  for (let rayIndex = 0; rayIndex < VISION_RAY_COUNT; rayIndex++) {
    castVisionRay(
      sampleOccluder,
      originX,
      originY,
      visionRayAngle(rayIndex),
      maxRange,
      unitInsideHouse,
      points,
      rayIndex * 2
    )
  }
  return points
}

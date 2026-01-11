import {getTeamColor} from "@/engine/render/util.ts";
import {type vec2, world} from "@/engine";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";

// Meters
const FOREST_THREASHHOLD = 200;
const NOT_IN_FOREST_MODIFIER = 0.25;

function isForestPixel(
  w: world,
  x: number,
  y: number
): boolean {
  const img = w.forestImageData
  if (!img) return false

  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false

  const i = (Math.floor(y) * img.width + Math.floor(x)) * 4
  return img.data[i + 3]! > 200
}

function castRay(
  w: world,
  origin: { x: number; y: number },
  angle: number,
  maxDist: number,
  fromForest: boolean,
) {
  const step = 5
  const dx = Math.cos(angle) * step
  const dy = Math.sin(angle) * step

  let x = origin.x
  let y = origin.y
  let dist = 0

  let forestThresholdTimer = 0;
  const forestThreshold = (fromForest ? FOREST_THREASHHOLD : FOREST_THREASHHOLD * NOT_IN_FOREST_MODIFIER)
    / window.ROOM_WORLD.map.metersPerPixel

  while (dist < maxDist) {
    if (isForestPixel(w, x, y)) {
      forestThresholdTimer += step
      if (forestThresholdTimer >= forestThreshold) {
        return { x, y }
      }
    }

    x += dx
    y += dy
    dist += step
  }

  return { x, y }
}

export function buildVisionPolygon(u: BaseUnit, w: world) {
  const origin = u.pos
  const maxRange = (u.visionRange / w.map.metersPerPixel)

  const rays = 180
  const points: { x: number; y: number }[] = []

  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2
    points.push(castRay(w, origin, angle, maxRange, u.envState.includes(UnitEnvironmentState.InForest)))
  }

  return points
}

// Cache raycast
type VisionCacheEntry = {
  pos: { x: number; y: number }
  polygon: vec2[] // результат buildVisionPolygon
}
const visionCache = new Map<string, VisionCacheEntry>();

// Cache Helper
function samePos(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x === b.x && a.y === b.y
}

/**
 * Основной вызов
 */
export function drawUnitVision(
  ctx: CanvasRenderingContext2D,
  w: world,
  settings: typeof window.CLIENT_SETTINGS,
) {
  for (const u of w.units.list()) {
    if (!u.alive || !u.stats.visionRange) {
      visionCache.delete(u.id);
      continue;
    }

    if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_ONLY_SELECTED] && !u.selected) {
      continue
    }

    const { r: cr, g: cg, b: cb } = getTeamColor(u.team)
    const fillAlpha = u.isSelected() ? 0.18 : 0.1

    // В лесу — простой круг, кеш не нужен
    if (!window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST]) {
      const p = w.camera.worldToScreen(u.pos)
      const r = (u.visionRange / w.map.metersPerPixel) * w.camera.zoom

      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)

      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.7)`
      ctx.lineWidth = 1 * w.camera.zoom
      ctx.stroke()

      ctx.fillStyle = `rgba(${cr},${cg},${cb},${fillAlpha})`
      ctx.fill()
      visionCache.delete(u.id);
      continue
    }

    // ===== КЕШ =====
    const unitInForest = u.envState.includes(UnitEnvironmentState.InForest)
    let cache = visionCache.get(`${u.id}_${unitInForest}`)
    let poly: vec2[]

    if (!cache || !samePos(cache.pos, u.pos)) {
      poly = buildVisionPolygon(u, w)

      visionCache.set(u.id, {
        pos: { x: u.pos.x, y: u.pos.y },
        polygon: poly
      })
    } else {
      poly = cache.polygon
    }

    const { r, g, b } = getTeamColor(u.team)

    ctx.beginPath()
    const start = w.camera.worldToScreen(poly[0]!)
    ctx.moveTo(start.x, start.y)

    for (let i = 1; i < poly.length; i++) {
      const p = w.camera.worldToScreen(poly[i]!)
      ctx.lineTo(p.x, p.y)
    }

    ctx.closePath()

    ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`
    ctx.lineWidth = w.camera.zoom
    ctx.stroke()

    ctx.fillStyle = `rgba(${cr},${cg},${cb},${fillAlpha})`
    ctx.fill()
  }
}

export function pointInPolygon(point: vec2, polygon: vec2[]): boolean {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x, yi = polygon[i]!.y
    const xj = polygon[j]!.x, yj = polygon[j]!.y

    const intersect =
      ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)

    if (intersect) inside = !inside
  }

  return inside
}



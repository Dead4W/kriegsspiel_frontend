import {getTeamColor} from "@/engine/render/util.ts";
import {type unitTeam, type vec2, world} from "@/engine";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";

// Чем дальше участок леса от юнита, тем сильнее он "гасит" луч.
// 0 = как раньше (лес одинаково "плотный" на любой дистанции).
const FOREST_DISTANCE_PENALTY = 3;

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
  maxDist: number
) {
  if (maxDist <= 0) return { x: origin.x, y: origin.y }

  const step = 6
  const dx = Math.cos(angle) * step
  const dy = Math.sin(angle) * step

  let x = origin.x
  let y = origin.y
  let dist = 0
  let realDist = 0

  while (dist < maxDist) {
    let iStep = step;

    if (isForestPixel(w, x, y)) {
      if (dist * 2 >= maxDist) break;
      const t = realDist / maxDist // 0..1
      const t2 = Math.pow(t, 0.3)
      const distanceMultiplier = 1 + t2 * FOREST_DISTANCE_PENALTY
      iStep *= distanceMultiplier
    }

    x += dx
    y += dy
    dist += iStep
    realDist += step
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
    points.push(castRay(w, origin, angle, maxRange))
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

type TeamVisionLayer = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}
const teamVisionLayers = new Map<unitTeam, TeamVisionLayer>()

function getTeamVisionCtx(
  teamId: unitTeam,
  width: number,
  height: number
): CanvasRenderingContext2D {
  let layer = teamVisionLayers.get(teamId)

  if (!layer) {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!

    layer = { canvas, ctx }
    teamVisionLayers.set(teamId, layer)
  }

  if (layer.canvas.width !== width || layer.canvas.height !== height) {
    layer.canvas.width = width
    layer.canvas.height = height
  }

  return layer.ctx
}

/**
 * Основной вызов
 */
export function drawUnitVision(
  ctx: CanvasRenderingContext2D,
  w: world,
  settings: typeof window.CLIENT_SETTINGS,
) {
  for (const layer of teamVisionLayers.values()) {
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0)
    layer.ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  }

  const units = [...w.units.list()].sort((a, b) => {
    if (a.selected === b.selected) return 0
    return a.selected ? 1 : -1
  })

  for (const u of units) {
    if (!u.alive || !u.stats.visionRange) {
      visionCache.delete(u.id);
      continue;
    }

    if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_ONLY_SELECTED] && !u.selected) {
      continue
    }

    const vCtx = getTeamVisionCtx(u.team, ctx.canvas.width, ctx.canvas.height)

    let { r, g, b } = getTeamColor(u.team)
    if (u.selected) {
      r = Math.min(r * 1.5, 255);
      g = Math.min(g * 1.5, 255);
      b = Math.min(b * 1.5, 255);
    }

    // ===== ПРОСТОЙ КРУГ =====
    if (!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST]) {
      const p = w.camera.worldToScreen(u.pos)
      const rPx = (u.visionRange / w.map.metersPerPixel) * w.camera.zoom

      vCtx.beginPath()
      vCtx.arc(p.x, p.y, rPx, 0, Math.PI * 2)

      vCtx.strokeStyle = `rgb(${r},${g},${b})`
      vCtx.lineWidth = 1 * w.camera.zoom
      vCtx.stroke()

      vCtx.fillStyle = `rgb(${r},${g},${b})`
      vCtx.fill()

      visionCache.delete(u.id)
      continue
    }

    // ===== КЕШ =====
    const unitInForest = u.envState.includes(UnitEnvironmentState.InForest)
    const cacheKey = `${u.id}_${unitInForest}`
    const cache = visionCache.get(cacheKey)

    let poly: vec2[]

    if (!cache || !samePos(cache.pos, u.pos)) {
      poly = buildVisionPolygon(u, w)
      visionCache.set(cacheKey, {
        pos: { ...u.pos },
        polygon: poly,
      })
    } else {
      poly = cache.polygon
    }

    // ===== ПОЛИГОН =====
    vCtx.beginPath()
    const start = w.camera.worldToScreen(poly[0]!)
    vCtx.moveTo(start.x, start.y)

    for (let i = 1; i < poly.length; i++) {
      const p = w.camera.worldToScreen(poly[i]!)
      vCtx.lineTo(p.x, p.y)
    }

    vCtx.closePath()

    vCtx.strokeStyle = `rgb(${r},${g},${b})`
    vCtx.lineWidth = w.camera.zoom
    vCtx.stroke()

    vCtx.fillStyle = `rgb(${r},${g},${b})`
    vCtx.fill()
  }

  // === НАКЛАДЫВАЕМ НА ОСНОВНОЙ CANVAS ===
  ctx.save()
  ctx.globalAlpha = 0.5
  for (const layer of teamVisionLayers.values()) {
    ctx.drawImage(layer.canvas, 0, 0)
  }
  ctx.restore()
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



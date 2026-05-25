import {getTeamColor} from "@/engine/2d/render/util.ts";
import {type unitTeam, type vec2, world} from "@/engine";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";

// Чем дальше участок леса от юнита, тем сильнее он "гасит" луч.
// 0 = как раньше (лес одинаково "плотный" на любой дистанции).
const FOREST_DISTANCE_PENALTY = 3;
const HOUSE_DISTANCE_PENALTY = 20;
const HOUSE_DISTANCE_PENALTY_WHEN_UNIT_INSIDE = 9;
const ENABLE_HOUSE_RAYCAST_MODIFIER = false;
const HOUSE_OCCLUDER_ENTITIES = new Set([
  'house',
  'building',
  'red_building',
  'cover_house',
  'fortified_house',
  'fortified_building',
])
const FOREST_OCCLUDER_ENTITY = 'forest'
const HOUSE_ENVIRONMENT_STATES = new Set([
  'in_house',
  'in_building',
  'in_cover_house',
  'in_fortified_house',
])

function getRaycastOccluderPenalty(
  unit: BaseUnit,
  w: world,
  x: number,
  y: number
): { penalty: number; softenedByDistance: boolean } | null {
  const objectMap = w.objectMapImageData
  if (objectMap && w.objectMapColorToEntity.size > 0) {
    if (x < 0 || y < 0 || x >= objectMap.width || y >= objectMap.height) return null
    const i = (Math.floor(y) * objectMap.width + Math.floor(x)) * 4
    const key = `${objectMap.data[i]},${objectMap.data[i + 1]},${objectMap.data[i + 2]}`
    const entity = w.objectMapColorToEntity.get(key)
    if (entity === FOREST_OCCLUDER_ENTITY) {
      return {
        penalty: FOREST_DISTANCE_PENALTY,
        softenedByDistance: true,
      }
    }
    if (
      ENABLE_HOUSE_RAYCAST_MODIFIER &&
      entity != null &&
      HOUSE_OCCLUDER_ENTITIES.has(entity)
    ) {
      const unitInsideHouse = unit.envState.some((state) => HOUSE_ENVIRONMENT_STATES.has(state))
      return {
        penalty: unitInsideHouse ? HOUSE_DISTANCE_PENALTY_WHEN_UNIT_INSIDE : HOUSE_DISTANCE_PENALTY,
        softenedByDistance: unitInsideHouse,
      }
    }
    return null
  }

  const img = w.forestImageData
  if (!img) return null

  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null

  const i = (Math.floor(y) * img.width + Math.floor(x)) * 4
  return img.data[i + 3]! > 200
    ? {
      penalty: FOREST_DISTANCE_PENALTY,
      softenedByDistance: true,
    }
    : null
}

function castRay(
  unit: BaseUnit,
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

    const occluder = getRaycastOccluderPenalty(unit, w, x, y)
    if (occluder != null) {
      if (dist * 2 >= maxDist) break;
      const distanceMultiplier = occluder.softenedByDistance
        ? (() => {
          const t = realDist / maxDist // 0..1
          const t2 = Math.pow(t, 0.3)
          return 1 + t2 * occluder.penalty
        })()
        : 1 + occluder.penalty
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
    points.push(castRay(u, w, origin, angle, maxRange))
  }

  return points
}

// Cache raycast
type VisionCacheEntry = {
  pos: { x: number; y: number }
  polygon: vec2[] // результат buildVisionPolygon
  createdAtMs: number
}
const visionCache = new Map<string, VisionCacheEntry>();

function clearUnitVisionCache(unitId: string) {
  for (const key of [...visionCache.keys()]) {
    if (key.startsWith(`${unitId}_`)) {
      visionCache.delete(key)
    }
  }
}

function getUnitVisionEnvironmentSignature(unit: BaseUnit): string {
  if (!unit.envState.length) return 'none'
  return [...unit.envState].sort().join('|')
}

// Cache Helper
function samePos(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x === b.x && a.y === b.y
}

function sameRoundedPos(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.round(a.x / 10) === Math.round(b.x / 10) && Math.round(a.y / 10) === Math.round(b.y / 10)
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
  const dpr = window.devicePixelRatio || 1
  const targetWidth = Math.floor(width * dpr)
  const targetHeight = Math.floor(height * dpr)
  let layer = teamVisionLayers.get(teamId)

  if (!layer) {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!

    layer = { canvas, ctx }
    teamVisionLayers.set(teamId, layer)
  }

  if (layer.canvas.width !== targetWidth || layer.canvas.height !== targetHeight) {
    layer.canvas.width = targetWidth
    layer.canvas.height = targetHeight
  }
  layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

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
  const viewportWidth = w.camera.viewport.x
  const viewportHeight = w.camera.viewport.y

  debugPerformance('drawUnitVision.clearTeamLayers', () => {
    for (const layer of teamVisionLayers.values()) {
      layer.ctx.setTransform(1, 0, 0, 1, 0, 0)
      layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
    }
  })

  let units: BaseUnit[] = []
  debugPerformance('drawUnitVision.sortUnits', () => {
    units = [...w.units.list()].sort((a, b) => {
      if (a.selected === b.selected) return 0
      return a.selected ? 1 : -1
    })
  })

  for (const u of units) {
    debugPerformance('drawUnitVision.unit', () => {
      if (!u.alive || !u.stats.visionRange) {
        clearUnitVisionCache(u.id)
        return
      }

      if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_ONLY_SELECTED] && !u.selected) {
        return
      }

      const vCtx = getTeamVisionCtx(u.team, viewportWidth, viewportHeight)

      let r = 0
      let g = 0
      let b = 0
      debugPerformance('drawUnitVision.resolveColor', () => {
        const teamColor = getTeamColor(u.team)
        r = teamColor.r
        g = teamColor.g
        b = teamColor.b
      })
      if (u.selected) {
        r = Math.min(r * 1.5, 255);
        g = Math.min(g * 1.5, 255);
        b = Math.min(b * 1.5, 255);
      }

      // ===== ПРОСТОЙ КРУГ =====
      if (!settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST]) {
        debugPerformance('drawUnitVision.circle', () => {
          const p = w.camera.worldToScreen(u.pos)
          const rPx = (u.visionRange / w.map.metersPerPixel) * w.camera.zoom

          vCtx.beginPath()
          vCtx.arc(p.x, p.y, rPx, 0, Math.PI * 2)

          vCtx.strokeStyle = `rgb(${r},${g},${b})`
          vCtx.lineWidth = 1 * w.camera.zoom
          vCtx.stroke()

          vCtx.fillStyle = `rgb(${r},${g},${b})`
          vCtx.fill()
        })
        clearUnitVisionCache(u.id)
        return
      }

      let poly: vec2[] = []
      debugPerformance('drawUnitVision.cacheAndPolygon', () => {
        const unitInForest = u.envState.includes(UnitEnvironmentState.InForest)
        const environmentSignature = getUnitVisionEnvironmentSignature(u)
        const cacheKey = `${u.id}_${unitInForest}_${environmentSignature}_${u.visionRange}`
        const cache = visionCache.get(cacheKey)

        const now = Date.now()
        const cacheExpired = cache != null && (now - cache.createdAtMs) > 1_000
        const shouldRebuildCache = (
          cache == null ||
          !sameRoundedPos(cache.pos, u.pos) ||
          (cacheExpired && !samePos(cache.pos, u.pos))
        )

        if (shouldRebuildCache) {
          debugPerformance('drawUnitVision.buildVisionPolygon', () => {
            poly = buildVisionPolygon(u, w)
          })
          visionCache.set(cacheKey, {
            pos: { ...u.pos },
            polygon: poly,
            createdAtMs: now,
          })
          return
        }

        poly = cache.polygon
      })

      // ===== ПОЛИГОН =====
      debugPerformance('drawUnitVision.drawPolygon', () => {
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
      })
    })
  }

  // === НАКЛАДЫВАЕМ НА ОСНОВНОЙ CANVAS ===
  debugPerformance('drawUnitVision.composite', () => {
    ctx.save()
    ctx.globalAlpha = 0.5
    for (const layer of teamVisionLayers.values()) {
      ctx.drawImage(layer.canvas, 0, 0, viewportWidth, viewportHeight)
    }
    ctx.restore()
  })
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



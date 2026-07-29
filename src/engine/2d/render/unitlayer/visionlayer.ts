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
  if (w.hasObjectNavMeshMap()) {
    const entity = w.getObjectNavMeshEntityAt({ x: Math.floor(x), y: Math.floor(y) })
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

  const rays = VISION_RAY_COUNT
  const points: { x: number; y: number }[] = []

  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2
    points.push(castRay(u, w, origin, angle, maxRange))
  }

  return points
}

// Cache raycast
const VISION_RAY_COUNT = 180

type VisionCacheEntry = {
  cacheKey: string
  pos: { x: number; y: number }
  polygon: vec2[] // результат buildVisionPolygon
}
const visionCache = new Map<string, VisionCacheEntry>()

type VisionRaycastRequest = {
  unit: BaseUnit
  world: world
  cacheKey: string
}

type ActiveVisionRaycast = VisionRaycastRequest & {
  origin: vec2
  maxRange: number
  nextRay: number
  polygon: vec2[]
  cancelled: boolean
}

const pendingVisionRaycasts = new Map<string, VisionRaycastRequest>()
let activeVisionRaycast: ActiveVisionRaycast | null = null
let visionRaycastCallbackScheduled = false

type RaycastTimeBudget = {
  timeRemaining: () => number
}

function scheduleVisionRaycastCallback() {
  if (
    visionRaycastCallbackScheduled ||
    (activeVisionRaycast == null && pendingVisionRaycasts.size === 0)
  ) {
    return
  }

  visionRaycastCallbackScheduled = true

  // The render loop gets the next animation frame first. Raycast work starts
  // from a timer after that frame has been painted and uses only a small slice.
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      const startedAt = performance.now()
      runVisionRaycastChunk({
        timeRemaining: () => Math.max(0, 8 - (performance.now() - startedAt)),
      })
    }, 0)
  })
}

function runVisionRaycastChunk(timeBudget: RaycastTimeBudget) {
  visionRaycastCallbackScheduled = false

  if (activeVisionRaycast?.cancelled) {
    activeVisionRaycast = null
  }

  if (activeVisionRaycast == null) {
    const nextRequest = pendingVisionRaycasts.entries().next().value
    if (nextRequest == null) return

    const [unitId, request] = nextRequest
    pendingVisionRaycasts.delete(unitId)
    activeVisionRaycast = {
      ...request,
      origin: { ...request.unit.pos },
      maxRange: request.unit.visionRange / request.world.map.metersPerPixel,
      nextRay: 0,
      polygon: [],
      cancelled: false,
    }
  }

  const raycast = activeVisionRaycast
  let processedRay = false

  debugPerformance('drawUnitVision.buildVisionPolygonAsync', () => {
    while (
      raycast.nextRay < VISION_RAY_COUNT &&
      (!processedRay || timeBudget.timeRemaining() > 1)
    ) {
      const angle = (raycast.nextRay / VISION_RAY_COUNT) * Math.PI * 2
      raycast.polygon.push(
        castRay(raycast.unit, raycast.world, raycast.origin, angle, raycast.maxRange),
      )
      raycast.nextRay += 1
      processedRay = true
    }
  })

  if (raycast.nextRay === VISION_RAY_COUNT) {
    if (!raycast.cancelled) {
      visionCache.set(raycast.unit.id, {
        cacheKey: raycast.cacheKey,
        pos: raycast.origin,
        polygon: raycast.polygon,
      })
    }
    activeVisionRaycast = null
  }

  scheduleVisionRaycastCallback()
}

function requestVisionRaycast(unit: BaseUnit, w: world, cacheKey: string) {
  if (activeVisionRaycast?.unit.id === unit.id) {
    pendingVisionRaycasts.delete(unit.id)
    return
  }

  const request = { unit, world: w, cacheKey }

  // One latest request per unit is retained; repeated frames cannot build a queue.
  pendingVisionRaycasts.set(unit.id, request)
  scheduleVisionRaycastCallback()
}

function clearUnitVisionCache(unitId: string) {
  visionCache.delete(unitId)
  pendingVisionRaycasts.delete(unitId)
  if (activeVisionRaycast?.unit.id === unitId) {
    activeVisionRaycast.cancelled = true
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

      let poly: vec2[] | null = null
      debugPerformance('drawUnitVision.cacheAndPolygon', () => {
        const unitInForest = u.envState.includes(UnitEnvironmentState.InForest)
        const environmentSignature = getUnitVisionEnvironmentSignature(u)
        const cacheKey = `${u.id}_${unitInForest}_${environmentSignature}_${u.visionRange}`
        const cache = visionCache.get(u.id)
        const shouldRebuildCache =
          cache == null ||
          cache.cacheKey !== cacheKey ||
          !samePos(cache.pos, u.pos)

        if (shouldRebuildCache) {
          requestVisionRaycast(u, w, cacheKey)
        }

        poly = cache?.polygon ?? null
      })

      // ===== ПОЛИГОН =====
      debugPerformance('drawUnitVision.drawPolygon', () => {
        if (poly == null || poly.length === 0) return

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



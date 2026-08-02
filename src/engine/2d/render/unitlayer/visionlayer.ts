import {getTeamColor} from "@/engine/2d/render/util.ts";
import {type unitTeam, type vec2, world} from "@/engine";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import {isScreenPointVisible} from "@/engine/2d/render/culling.ts";
import {
  buildForestMask,
  buildVisionPolygonPoints,
  castVisionRay,
  createOccluderSampler,
  createVisionPolygonBuffer,
  ENABLE_HOUSE_RAYCAST_MODIFIER,
  FOREST_OCCLUDER_ENTITY,
  HOUSE_ENVIRONMENT_STATES,
  HOUSE_OCCLUDER_ENTITIES,
  type OccluderSampler,
  VISION_RAY_COUNT,
  type VisionOccluderField,
  visionRayAngle,
} from "@/engine/2d/render/unitlayer/visionRaycastCore.ts";
import {
  setVisionRaycastPolygonHandler,
  setVisionRaycastWorkerDisabledHandler,
  submitVisionRaycastJobs,
} from "@/engine/2d/render/unitlayer/visionRaycastClient.ts";
import type {VisionRaycastJob} from "@/engine/2d/render/unitlayer/visionRaycastProtocol.ts";

export const UNIT_RENDER_DETAIL_MIN_ZOOM = 0.75
const DISTANT_VISION_POINT_STRIDE = 2

/** Порог LOD в масштабе камеры с учётом масштаба карты. */
export function getUnitRenderDetailMinZoom(metersPerPixel: number): number {
  const mapScale = Math.max(0.0001, Number(metersPerPixel) || 1) / 2
  return UNIT_RENDER_DETAIL_MIN_ZOOM * mapScale
}

type OccluderFieldSnapshot = {
  // Источник, по идентичности которого решается, устарел ли снимок: nav-mesh и
  // forestImageData пересобираются целиком при смене карты.
  source: object | null
  field: VisionOccluderField
  version: number
  sampleOccluder: OccluderSampler
}

let occluderFieldSnapshot: OccluderFieldSnapshot | null = null
let occluderFieldVersion = 0

function buildOccluderField(w: world): VisionOccluderField {
  const navMesh = w.hasObjectNavMeshMap() ? w.objectNavMeshMap : undefined
  if (navMesh) {
    const houseEntityFlags = new Uint8Array(navMesh.entitiesById.length)
    if (ENABLE_HOUSE_RAYCAST_MODIFIER) {
      for (const entity of HOUSE_OCCLUDER_ENTITIES) {
        const entityId = navMesh.entityIdByName.get(entity)
        if (entityId != null) houseEntityFlags[entityId] = 1
      }
    }

    return {
      kind: 'navmesh',
      // Пиксельные буферы отдаются по ссылке: основной поток читает их без
      // копии, а копию для воркера делает structuredClone при отправке.
      zones: navMesh.zones.map((zone) => ({
        minX: zone.minX,
        minY: zone.minY,
        maxX: zone.maxX,
        maxY: zone.maxY,
        width: zone.width,
        pixels: zone.pixels,
      })),
      forestEntityId: navMesh.entityIdByName.get(FOREST_OCCLUDER_ENTITY) ?? -1,
      houseEntityFlags,
    }
  }

  const forest = w.forestImageData
  if (forest) {
    return {
      kind: 'forest',
      width: forest.width,
      height: forest.height,
      forestMask: buildForestMask(forest.data, forest.width, forest.height),
    }
  }

  return { kind: 'none' }
}

function getOccluderFieldSnapshot(w: world): OccluderFieldSnapshot {
  const source = (w.hasObjectNavMeshMap() ? w.objectNavMeshMap : w.forestImageData) ?? null
  if (occluderFieldSnapshot?.source === source) return occluderFieldSnapshot

  const field = buildOccluderField(w)
  occluderFieldVersion += 1
  occluderFieldSnapshot = {
    source,
    field,
    version: occluderFieldVersion,
    sampleOccluder: createOccluderSampler(field),
  }

  return occluderFieldSnapshot
}

function isUnitInsideHouse(unit: BaseUnit): boolean {
  if (!ENABLE_HOUSE_RAYCAST_MODIFIER) return false
  return unit.envState.some((state) => HOUSE_ENVIRONMENT_STATES.has(state))
}

function visionPointsToPolygon(points: Float32Array): vec2[] {
  const polygon: vec2[] = new Array(points.length / 2)
  for (let i = 0; i < polygon.length; i++) {
    polygon[i] = { x: points[i * 2]!, y: points[i * 2 + 1]! }
  }
  return polygon
}

/**
 * Синхронный расчёт обзора. Используется игровой логикой (direct view), которая
 * не может ждать воркер и должна видеть состояние ровно текущего тика.
 */
export function buildVisionPolygon(u: BaseUnit, w: world): vec2[] {
  const points = buildVisionPolygonPoints(
    getOccluderFieldSnapshot(w).sampleOccluder,
    u.pos.x,
    u.pos.y,
    u.visionRange / w.map.metersPerPixel,
    isUnitInsideHouse(u),
  )

  return visionPointsToPolygon(points)
}

// Cache raycast

type VisionRequestSnapshot = {
  // envState всегда переприсваивается новым массивом, поэтому сравнения по ссылке
  // достаточно и оно не требует ни сортировки, ни склейки ключа каждый кадр.
  envState: BaseUnit['envState']
  visionRange: number
  pos: { x: number; y: number }
}

type VisionCacheEntry = VisionRequestSnapshot & {
  fieldVersion: number
  path: Path2D // полигон в мировых координатах, готовый к отрисовке
  distantPath: Path2D // тот же результат raycast, но с каждой второй точкой
}
const visionCache = new Map<string, VisionCacheEntry>()

type VisionRaycastRequest = VisionRequestSnapshot & {
  unitId: string
  token: number
  fieldVersion: number
  maxRange: number
  unitInsideHouse: boolean
  sampleOccluder: OccluderSampler
  route: 'worker' | 'main'
}

// По одному активному запросу на юнит: повторные кадры не могут отрастить
// очередь, а ответ с чужим token'ом отбрасывается как устаревший.
const requestsByUnitId = new Map<string, VisionRaycastRequest>()
let requestTokenCounter = 0

type ActiveMainThreadRaycast = VisionRaycastRequest & {
  points: Float32Array
  nextRay: number
}

const mainThreadQueue = new Map<string, VisionRaycastRequest>()
let activeMainThreadRaycast: ActiveMainThreadRaycast | null = null
let mainThreadCallbackScheduled = false

type RaycastTimeBudget = {
  timeRemaining: () => number
}

function scheduleMainThreadRaycastCallback() {
  if (
    mainThreadCallbackScheduled ||
    (activeMainThreadRaycast == null && mainThreadQueue.size === 0)
  ) {
    return
  }

  mainThreadCallbackScheduled = true

  // The render loop gets the next animation frame first. Raycast work starts
  // from a timer after that frame has been painted and uses only a small slice.
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      const startedAt = performance.now()
      runMainThreadRaycastChunk({
        timeRemaining: () => Math.max(0, 8 - (performance.now() - startedAt)),
      })
    }, 0)
  })
}

function isRequestCurrent(request: VisionRaycastRequest): boolean {
  return requestsByUnitId.get(request.unitId)?.token === request.token
}

function storeVisionPolygon(request: VisionRaycastRequest, points: Float32Array) {
  if (!isRequestCurrent(request)) return

  requestsByUnitId.delete(request.unitId)
  visionCache.set(request.unitId, {
    envState: request.envState,
    visionRange: request.visionRange,
    pos: request.pos,
    fieldVersion: request.fieldVersion,
    path: buildPolygonPath(points),
    distantPath: buildPolygonPath(points, DISTANT_VISION_POINT_STRIDE),
  })
}

function runMainThreadRaycastChunk(timeBudget: RaycastTimeBudget) {
  mainThreadCallbackScheduled = false

  if (activeMainThreadRaycast != null && !isRequestCurrent(activeMainThreadRaycast)) {
    activeMainThreadRaycast = null
  }

  if (activeMainThreadRaycast == null) {
    const nextRequest = mainThreadQueue.entries().next().value
    if (nextRequest == null) return

    const [unitId, request] = nextRequest
    mainThreadQueue.delete(unitId)
    if (!isRequestCurrent(request)) {
      scheduleMainThreadRaycastCallback()
      return
    }

    activeMainThreadRaycast = {
      ...request,
      points: createVisionPolygonBuffer(),
      nextRay: 0,
    }
  }

  const raycast = activeMainThreadRaycast
  let processedRay = false

  debugPerformance('drawUnitVision.buildVisionPolygonAsync', () => {
    while (
      raycast.nextRay < VISION_RAY_COUNT &&
      (!processedRay || timeBudget.timeRemaining() > 1)
    ) {
      castVisionRay(
        raycast.sampleOccluder,
        raycast.pos.x,
        raycast.pos.y,
        visionRayAngle(raycast.nextRay),
        raycast.maxRange,
        raycast.unitInsideHouse,
        raycast.points,
        raycast.nextRay * 2,
      )
      raycast.nextRay += 1
      processedRay = true
    }
  })

  if (raycast.nextRay === VISION_RAY_COUNT) {
    storeVisionPolygon(raycast, raycast.points)
    activeMainThreadRaycast = null
  }

  scheduleMainThreadRaycastCallback()
}

function buildPolygonPath(points: Float32Array, pointStride = 1): Path2D {
  const path = new Path2D()
  if (points.length < 2) return path

  path.moveTo(points[0]!, points[1]!)
  for (let i = pointStride * 2; i < points.length; i += pointStride * 2) {
    path.lineTo(points[i]!, points[i + 1]!)
  }
  path.closePath()

  return path
}

setVisionRaycastPolygonHandler((unitId, token, points) => {
  const request = requestsByUnitId.get(unitId)
  if (request?.token !== token) return
  storeVisionPolygon(request, points)
})

// Воркер может отвалиться уже после отправки лучей: те запросы ответа не
// дождутся, поэтому их надо досчитать в основном потоке.
setVisionRaycastWorkerDisabledHandler(() => {
  for (const request of requestsByUnitId.values()) {
    if (request.route !== 'worker') continue
    request.route = 'main'
    mainThreadQueue.set(request.unitId, request)
  }
  scheduleMainThreadRaycastCallback()
})

function isVisionCacheFresh(
  cache: VisionCacheEntry | undefined,
  unit: BaseUnit,
  fieldVersion: number,
): boolean {
  return (
    cache != null &&
    cache.fieldVersion === fieldVersion &&
    cache.envState === unit.envState &&
    cache.visionRange === unit.visionRange &&
    samePos(cache.pos, unit.pos)
  )
}

function createVisionRaycastRequest(
  unit: BaseUnit,
  w: world,
  snapshot: OccluderFieldSnapshot,
): VisionRaycastRequest {
  requestTokenCounter += 1

  return {
    unitId: unit.id,
    token: requestTokenCounter,
    fieldVersion: snapshot.version,
    envState: unit.envState,
    visionRange: unit.visionRange,
    pos: { x: unit.pos.x, y: unit.pos.y },
    maxRange: unit.visionRange / w.map.metersPerPixel,
    unitInsideHouse: isUnitInsideHouse(unit),
    sampleOccluder: snapshot.sampleOccluder,
    route: 'worker',
  }
}

function toVisionRaycastJob(request: VisionRaycastRequest): VisionRaycastJob {
  return {
    unitId: request.unitId,
    token: request.token,
    originX: request.pos.x,
    originY: request.pos.y,
    maxRange: request.maxRange,
    unitInsideHouse: request.unitInsideHouse,
  }
}

function dispatchVisionRaycasts(snapshot: OccluderFieldSnapshot, requests: VisionRaycastRequest[]) {
  if (submitVisionRaycastJobs(snapshot.field, snapshot.version, requests.map(toVisionRaycastJob))) {
    return
  }

  for (const request of requests) {
    request.route = 'main'
    mainThreadQueue.set(request.unitId, request)
  }
  scheduleMainThreadRaycastCallback()
}

function clearUnitVisionCache(unitId: string) {
  visionCache.delete(unitId)
  requestsByUnitId.delete(unitId)
  mainThreadQueue.delete(unitId)
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

type TeamVisionBatch = {
  regular: Path2D
  selected: Path2D
  hasRegular: boolean
  hasSelected: boolean
}

function getTeamVisionBatch(
  batches: Map<unitTeam, TeamVisionBatch>,
  teamId: unitTeam,
): TeamVisionBatch {
  let batch = batches.get(teamId)
  if (!batch) {
    batch = {
      regular: new Path2D(),
      selected: new Path2D(),
      hasRegular: false,
      hasSelected: false,
    }
    batches.set(teamId, batch)
  }
  return batch
}

function addPathToTeamVisionBatch(
  batch: TeamVisionBatch,
  path: Path2D,
  selected: boolean,
) {
  if (selected) {
    batch.selected.addPath(path)
    batch.hasSelected = true
  } else {
    batch.regular.addPath(path)
    batch.hasRegular = true
  }
}

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
    units = w.units.list()
  })

  const fieldSnapshot = getOccluderFieldSnapshot(w)
  const newRequests: VisionRaycastRequest[] = []
  const visionBatches = new Map<unitTeam, TeamVisionBatch>()
  const useForestRaycast =
    settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_FOREST_RAYCAST]

  for (const u of units) {
    debugPerformance('drawUnitVision.unit', () => {
      if (!u.alive || !u.stats.visionRange) {
        clearUnitVisionCache(u.id)
        return
      }

      if (settings[CLIENT_SETTING_KEYS.SHOW_UNIT_VISION_ONLY_SELECTED] && !u.selected) {
        return
      }

      const screenPos = w.camera.worldToScreen(u.pos)
      const visionRadiusPx = (u.visionRange / w.map.metersPerPixel) * w.camera.zoom
      if (!isScreenPointVisible(screenPos.x, screenPos.y, w.camera, visionRadiusPx)) {
        return
      }

      const batch = getTeamVisionBatch(visionBatches, u.team)

      // ===== ПРОСТОЙ КРУГ =====
      if (!useForestRaycast) {
        const circle = u.selected ? batch.selected : batch.regular
        circle.moveTo(screenPos.x + visionRadiusPx, screenPos.y)
        circle.arc(screenPos.x, screenPos.y, visionRadiusPx, 0, Math.PI * 2)
        if (u.selected) batch.hasSelected = true
        else batch.hasRegular = true
        clearUnitVisionCache(u.id)
        return
      }

      let path: Path2D | null = null
      debugPerformance('drawUnitVision.cacheAndPolygon', () => {
        const cache = visionCache.get(u.id)

        // Один незавершённый запрос на юнит: пока он считается, новые входные
        // данные игнорируются. Иначе юнит, который двигается каждый кадр,
        // перезапускал бы расчёт и никогда не доводил бы его до конца.
        if (!isVisionCacheFresh(cache, u, fieldSnapshot.version) && !requestsByUnitId.has(u.id)) {
          const request = createVisionRaycastRequest(u, w, fieldSnapshot)
          requestsByUnitId.set(u.id, request)
          newRequests.push(request)
        }

        path =
          (w.camera.zoom < getUnitRenderDetailMinZoom(w.map.metersPerPixel)
            ? cache?.distantPath
            : cache?.path) ?? null
      })

      // ===== ПОЛИГОН =====
      debugPerformance('drawUnitVision.drawPolygon', () => {
        if (path == null) return
        addPathToTeamVisionBatch(batch, path, u.selected)
      })
    })
  }

  // Одно сообщение на кадр: воркер получает все "поехавшие" юниты сразу, а если
  // он недоступен, пачка целиком уходит в кусочный расчёт основного потока.
  debugPerformance('drawUnitVision.dispatchRaycasts', () => {
    dispatchVisionRaycasts(fieldSnapshot, newRequests)
  })

  // Все полигоны одной команды имеют одинаковый цвет. Объединение сокращает
  // сотни переключений состояния canvas и fill/stroke до двух батчей на команду.
  debugPerformance('drawUnitVision.drawBatches', () => {
    for (const [teamId, batch] of visionBatches) {
      const vCtx = getTeamVisionCtx(teamId, viewportWidth, viewportHeight)
      const { r, g, b } = getTeamColor(teamId)

      vCtx.save()
      if (useForestRaycast) {
        // Raycast-пути хранятся в мировых координатах.
        const zoom = w.camera.zoom
        vCtx.transform(zoom, 0, 0, zoom, -w.camera.pos.x * zoom, -w.camera.pos.y * zoom)
        vCtx.lineWidth = 1
      } else {
        vCtx.lineWidth = w.camera.zoom
      }

      if (batch.hasRegular) {
        const color = `rgb(${r},${g},${b})`
        vCtx.strokeStyle = color
        vCtx.fillStyle = color
        vCtx.stroke(batch.regular)
        vCtx.fill(batch.regular)
      }

      if (batch.hasSelected) {
        const selectedColor =
          `rgb(${Math.min(r * 1.5, 255)},${Math.min(g * 1.5, 255)},${Math.min(b * 1.5, 255)})`
        vCtx.strokeStyle = selectedColor
        vCtx.fillStyle = selectedColor
        vCtx.stroke(batch.selected)
        vCtx.fill(batch.selected)
      }
      vCtx.restore()
    }
  })

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

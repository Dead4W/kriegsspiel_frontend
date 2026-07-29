import * as THREE from 'three'
import type { world } from '@/engine/world/world'
import type { RenderSceneAssets } from '@/engine/orchestrators/renderOrchestrator'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'
import { getWeatherEffect } from '@/engine/resourcePack/weather'
import {
  buildPixelOccupancyFromComponents,
  buildPixelOccupancyFromPoints,
  extractLayerComponentsFromMask,
  extractLayerPointsFromMask,
  filterComponentsOutsideOccupancy,
  filterPointsOutsideOccupancy,
  parseColorMaskFromImageData,
  resolveLayerSamplingStep,
  type ParsedColorMask,
} from './mask'
import { hash2D } from './math'
import { makeGround } from './environment'
import { addForestTrees } from './objects/forest'
import { addBuildingsFromComponents } from './objects/buildings'
import { addBridges, buildBridgeWaterConnectors } from './objects/bridges'
import {
  buildRoadDatasets,
  buildRoadTransitionPoints,
  createRoadMaterialFactory,
  createRoadTransitionMaterialFactory,
  renderRoadLayer,
} from './objects/roads'
import { addWaterLayer } from './objects/water'
import { createUnitsLayer, type UnitsLayerRenderer } from './objects/units'
import { createSunSystem, resolveSunTimeHoursFromWorldTime } from './sun'
import { createCloudyWeatherLayer, type CloudyWeatherLayer } from './weather/cloudy'
import { createSkyLayer, type SkyLayer } from './weather/sky'
import {
  clearMaskOutsideRects,
  getSceneActiveZoneKey,
  getSceneActiveZoneRects,
  getSceneBounds,
  getSceneZoneBounds,
  type SceneBounds,
} from './activeZone'
import { RoomGameStage } from '@/enums/roomStage'

export type ThreeCameraState = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

export class threeRenderer {
  private static readonly MIN_VIEW_DISTANCE = 1800
  private static readonly MAX_VIEW_DISTANCE = 6000
  private static readonly VIEW_DISTANCE_MAP_FACTOR = 1.04
  // Push fog onset farther so mid-range visibility stays clear.
  private static readonly FOG_NEAR_FACTOR = 2.0
  private static readonly FOG_FAR_FACTOR = 2.5
  private static readonly CAMERA_SPEED_NEAR_MULTIPLIER = 0.3
  private static readonly CAMERA_SPEED_FAR_MULTIPLIER = 1.9
  private static readonly MINIMAP_TOP_MARGIN = 14
  private static readonly MINIMAP_RIGHT_MARGIN = 70
  private static readonly HORIZONTAL_FOG_ENABLED = true
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100000)
  private overlayCanvas: HTMLCanvasElement
  private overlayCtx: CanvasRenderingContext2D
  private objectsGroup = new THREE.Group()
  private mapImage: CanvasImageSource | null = null
  private assets: RenderSceneAssets | null = null
  private inited = false
  private sceneBuildPromise: Promise<void> | null = null
  private lastMapWidth = 1
  private lastMapHeight = 1
  private metersPerPixel = 1
  private minimapStaticCanvas: HTMLCanvasElement | null = null
  private minimapStaticKey: string | null = null
  private sunSystem = createSunSystem({ scene: this.scene })
  private sunTimeHours = 14
  private frameStartedAtMs = performance.now()
  private lastFrameAtMs = this.frameStartedAtMs
  private keyState: Record<string, boolean> = {}
  private pointerLocked = false
  private yaw = 0
  private pitch = -0.55
  private removeListeners: Array<() => void> = []
  private waterUpdater: ((elapsedSeconds: number, camera: THREE.PerspectiveCamera, lighting: any) => void) | null =
    null
  private cloudyWeatherLayer: CloudyWeatherLayer = createCloudyWeatherLayer(this.scene)
  private skyLayer: SkyLayer = createSkyLayer(this.scene)
  private unitsLayer: UnitsLayerRenderer | null = null
  private viewDistance = 1800
  private stage: RoomGameStage = RoomGameStage.PLANNING
  // Подпись зон, по которой собрана сцена: расходится — пересобираем.
  private builtActiveZoneKey: string | null = null
  private sceneBounds: SceneBounds | null = null
  private sceneZoneBounds: SceneBounds[] = []
  // Целая маска объектов; копия под текущие зоны делается на каждую пересборку.
  private parsedMask: ParsedColorMask | null = null
  private parsedMaskSource: ImageBitmap | null = null

  constructor(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.shadowMap.autoUpdate = true

    this.scene.background = null
    this.scene.fog = new THREE.Fog(0x8cb0ff, this.viewDistance * 0.58, this.viewDistance)
    this.scene.add(this.objectsGroup)

    this.camera.far = this.viewDistance
    this.camera.position.set(0, 55, 0)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')

    this.overlayCanvas = overlayCanvas
    const overlayCtx = overlayCanvas.getContext('2d')
    if (!overlayCtx) throw new Error('no_overlay_canvas_2d')
    this.overlayCtx = overlayCtx
    this.bindInput()
  }

  setMapImage(img: CanvasImageSource) {
    this.mapImage = img
  }

  async setSceneAssets(assets: RenderSceneAssets) {
    this.assets = assets
    this.mapImage = assets.mapImage
    this.metersPerPixel = Math.max(0.01, Number(assets.metersPerPixel) || 1)
    this.minimapStaticCanvas = null
    this.minimapStaticKey = null
    this.parsedMask = null
    this.parsedMaskSource = null
    this.inited = false
    await this.ensureSceneReady()
  }

  getCameraState(): ThreeCameraState {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
    }
  }

  setCameraState(state: unknown) {
    if (!state || typeof state !== 'object') return
    const candidate = state as Partial<ThreeCameraState>
    const x = Number(candidate.x)
    const y = Number(candidate.y)
    const z = Number(candidate.z)
    const yaw = Number(candidate.yaw)
    const pitch = Number(candidate.pitch)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return
    this.camera.position.set(x, y, z)
    this.yaw = yaw
    this.pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.clampCameraToWorldBounds()
  }

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()

    this.overlayCanvas.width = Math.floor(w * dpr)
    this.overlayCanvas.height = Math.floor(h * dpr)
    this.overlayCanvas.style.width = `${w}px`
    this.overlayCanvas.style.height = `${h}px`
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.overlayCtx.imageSmoothingEnabled = true
  }

  render(w: world) {
    this.lastMapWidth = w.map.width
    this.lastMapHeight = w.map.height
    this.stage = w.stage
    this.invalidateSceneOnActiveZoneChange()
    this.ensureSceneReadySync()
    const nowMs = performance.now()
    w.units.syncRemoteMoveFrames(nowMs)
    const delta = Math.min((nowMs - this.lastFrameAtMs) / 1000, 0.05)
    const elapsed = (nowMs - this.frameStartedAtMs) / 1000
    this.lastFrameAtMs = nowMs
    this.sunTimeHours = resolveSunTimeHoursFromWorldTime((w as unknown as { time?: unknown })?.time)
    this.updateFlight(delta)
    const sunState = this.sunSystem.update({
      world: { width: this.lastMapWidth, height: this.lastMapHeight, cellSize: this.metersPerPixel },
      sunTimeHours: this.sunTimeHours,
      camera: this.camera,
    })
    const weatherEffect = getWeatherEffect(w.weather.value)
    this.skyLayer.update({
      camera: this.camera,
      sunPosition: sunState.sunPosition,
      daylight: sunState.daylight,
      twilight: sunState.twilight,
      weatherEffect,
    })
    this.updateVisibilityRanges()
    this.applyRadialFogToSceneMaterials()
    this.waterUpdater?.(elapsed, this.camera, sunState)
    this.unitsLayer?.update(w.units.list(), elapsed, delta, this.camera)
    const weatherShadersEnabled = Boolean(
      window.CLIENT_SETTINGS?.[CLIENT_SETTING_KEYS.SHOW_WEATHER_SHADERS]
    )
    this.cloudyWeatherLayer.update({
      camera: this.camera,
      elapsedSeconds: elapsed,
      enabled: weatherShadersEnabled && weatherEffect?.type === 'clouds',
      daylight: sunState.daylight,
    })
    this.renderer.render(this.scene, this.camera)
  }

  renderOverlay(_w: world) {
    const ctx = this.overlayCtx
    const canvas = this.overlayCanvas
    const { cssWidth, cssHeight, minimapWidth, minimapHeight, x, y } = this.resolveMinimapLayout()

    ctx.clearRect(0, 0, cssWidth, cssHeight)

    const minimapStaticCanvas = this.resolveMinimapStaticCanvas()
    if (minimapStaticCanvas) {
      ctx.drawImage(minimapStaticCanvas, x, y, minimapWidth, minimapHeight)
    } else {
      ctx.fillStyle = '#263425'
      ctx.fillRect(x, y, minimapWidth, minimapHeight)
    }

    ctx.strokeStyle = 'rgba(201, 255, 209, 0.8)'
    ctx.lineWidth = Math.max(1, minimapWidth * 0.006)
    ctx.strokeRect(x + 0.5, y + 0.5, minimapWidth - 1, minimapHeight - 1)

    const bounds = this.resolveSceneBounds()
    const worldWidth = bounds.maxX - bounds.minX
    const worldHeight = bounds.maxZ - bounds.minZ
    const visibilityRadius = this.getVisibilityRadiusMeters()
    const spanNx = (visibilityRadius * 2) / Math.max(1, worldWidth)
    const spanNy = (visibilityRadius * 2) / Math.max(1, worldHeight)
    const rw = Math.min(minimapWidth, Math.max(2, spanNx * minimapWidth))
    const rh = Math.min(minimapHeight, Math.max(2, spanNy * minimapHeight))
    const centerNx = THREE.MathUtils.clamp(
      (this.camera.position.x - bounds.minX) / Math.max(1, worldWidth),
      0,
      1
    )
    const centerNy = THREE.MathUtils.clamp(
      (this.camera.position.z - bounds.minZ) / Math.max(1, worldHeight),
      0,
      1
    )
    const centerX = x + centerNx * minimapWidth
    const centerY = y + centerNy * minimapHeight
    const rx = THREE.MathUtils.clamp(centerX - rw * 0.5, x, x + minimapWidth - rw)
    const ry = THREE.MathUtils.clamp(centerY - rh * 0.5, y, y + minimapHeight - rh)
    ctx.fillStyle = 'rgba(123, 220, 255, 0.14)'
    ctx.fillRect(rx, ry, rw, rh)
    ctx.strokeStyle = 'rgba(123, 220, 255, 0.95)'
    ctx.lineWidth = Math.max(1.2, minimapWidth * 0.007)
    ctx.strokeRect(rx, ry, rw, rh)

    const dotX = x + centerNx * minimapWidth
    const dotY = y + centerNy * minimapHeight

    ctx.fillStyle = 'rgba(255, 101, 101, 0.95)'
    ctx.beginPath()
    ctx.arc(dotX, dotY, Math.max(2.2, minimapWidth * 0.013), 0, Math.PI * 2)
    ctx.fill()
  }

  dispose() {
    for (let i = 0; i < this.removeListeners.length; i += 1) this.removeListeners[i]!()
    this.removeListeners = []
    this.renderer.dispose()
    this.skyLayer.dispose()
    this.cloudyWeatherLayer.dispose()
    this.clearObjects()
    this.waterUpdater = null
    this.parsedMask = null
    this.parsedMaskSource = null
  }

  private async ensureSceneReady() {
    if (this.inited) return
    this.ensureSceneReadySync()
    if (this.sceneBuildPromise) {
      await this.sceneBuildPromise
    }
  }

  // Зоны меняются админом и стадией игры, а сцена собирается один раз, поэтому
  // на расхождение подписи запускаем пересборку.
  private invalidateSceneOnActiveZoneChange() {
    if (this.sceneBuildPromise) return
    const key = getSceneActiveZoneKey(this.stage)
    if (this.builtActiveZoneKey === null || this.builtActiveZoneKey === key) return
    this.builtActiveZoneKey = null
    // Границы пересчитаются на пересборке; до неё лучше считать их заново,
    // чем клампить камеру и резать миникарту по старым зонам.
    this.sceneBounds = null
    this.inited = false
  }

  private ensureSceneReadySync() {
    if (this.inited || this.sceneBuildPromise) return
    this.sceneBuildPromise = this.rebuildScene()
      .then(() => {
        this.inited = true
      })
      .catch((error) => {
        console.error('rebuildScene:error', error)
        // Stop retry storms on permanent failures.
        this.inited = true
      })
      .finally(() => {
        this.sceneBuildPromise = null
      })
  }

  /**
   * Разбор маски объектов стоит секунды на большой карте, а пересборка сцены
   * нужна каждый раз, когда админ правит зоны. Поэтому разобранную маску
   * держим целой и отдаём копию — её уже можно гасить под текущие зоны.
   */
  private async resolveParsedMask(
    bitmap: ImageBitmap,
    meta: Record<string, unknown>
  ): Promise<ParsedColorMask | null> {
    if (!this.parsedMask || this.parsedMaskSource !== bitmap) {
      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = bitmap.width
      sourceCanvas.height = bitmap.height
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
      if (!sourceCtx) return null
      sourceCtx.drawImage(bitmap, 0, 0)
      const imageData = sourceCtx.getImageData(0, 0, bitmap.width, bitmap.height)
      await this.yieldToMainThread()

      const longestSide = Math.max(bitmap.width, bitmap.height)
      const targetMaxSide =
        longestSide >= 9000 ? 2600 : longestSide >= 7000 ? 2800 : longestSide >= 5000 ? 3000 : 3400

      this.parsedMask = await parseColorMaskFromImageData(
        imageData.data,
        bitmap.width,
        bitmap.height,
        meta,
        { targetMaxSide }
      )
      this.parsedMaskSource = bitmap
    }

    return { ...this.parsedMask, labels: this.parsedMask.labels.slice() }
  }

  private async rebuildScene() {
    if (!this.mapImage) return

    // Сцена может собираться до первого render(), а от стадии зависит, режем ли
    // мы карту зонами. Иначе админ в war успевал построить всю карту зря.
    this.stage = window.ROOM_WORLD?.stage ?? this.stage
    this.builtActiveZoneKey = getSceneActiveZoneKey(this.stage)
    this.clearObjects()
    this.waterUpdater = null
    await this.yieldToMainThread()

    if (!this.assets?.objectMapImage || !this.assets?.objectMapMeta) {
      this.buildFallbackSceneFromMap()
      return
    }

    const parsedMask = await this.resolveParsedMask(
      this.assets.objectMapImage,
      this.assets.objectMapMeta as Record<string, unknown>
    )
    if (!parsedMask) return
    await this.yieldToMainThread()
    const sourceSampleStep = Math.max(1, Number(parsedMask.sampleStep ?? 1))
    const sampledPixelSpan = Math.max(1, sourceSampleStep)

    const worldInfo = {
      width: Number(parsedMask.sourceWidth ?? parsedMask.width),
      height: Number(parsedMask.sourceHeight ?? parsedMask.height),
      cellSize: this.metersPerPixel,
      objectSize: this.metersPerPixel,
      sampledToSourceScale: sourceSampleStep,
    }
    this.lastMapWidth = worldInfo.width
    this.lastMapHeight = worldInfo.height
    const worldWidth = worldInfo.width * worldInfo.cellSize
    const worldHeight = worldInfo.height * worldInfo.cellSize

    // Гасим маску вне активных зон до извлечения слоёв: тогда деревья, здания,
    // дороги и река за пределами зон не строятся вообще.
    clearMaskOutsideRects(parsedMask, getSceneActiveZoneRects(this.stage))
    this.sceneBounds = getSceneBounds(this.stage, worldInfo)
    this.sceneZoneBounds = getSceneZoneBounds(this.stage, worldInfo)
    await this.yieldToMainThread()

    const largestSceneSideMeters = this.resolveLargestSceneSideMeters()
    this.camera.position.set(
      (this.sceneBounds.minX + this.sceneBounds.maxX) / 2,
      worldInfo.objectSize * 20,
      (this.sceneBounds.minZ + this.sceneBounds.maxZ) / 2 + largestSceneSideMeters * 0.18
    )
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')

    this.viewDistance = THREE.MathUtils.clamp(
      largestSceneSideMeters * threeRenderer.VIEW_DISTANCE_MAP_FACTOR,
      threeRenderer.MIN_VIEW_DISTANCE,
      threeRenderer.MAX_VIEW_DISTANCE
    )
    this.updateVisibilityRanges()
    await this.yieldToMainThread()

    const halfW = () => worldInfo.width / 2
    const halfH = () => worldInfo.height / 2
    const pixelToWorld = (px: number, py: number) => ({
      x: ((px + 0.5) * sourceSampleStep - halfW()) * worldInfo.cellSize,
      z: ((py + 0.5) * sourceSampleStep - halfH()) * worldInfo.cellSize,
    })
    const context = {
      scene: this.objectsGroup,
      renderer: this.renderer,
      world: worldInfo,
      pixelToWorld,
      hash2D,
    }

    this.unitsLayer = createUnitsLayer(context)

    makeGround(context, this.sceneZoneBounds)
    await this.yieldToMainThread()

    const layerSamplingSteps: Record<string, number> = {
      // Keep forest dense even when mask parsing is downsampled.
      forest: 1,
      road: 1,
      good_road: 1,
      river: 1,
    }
    const forestSamplingStep = resolveLayerSamplingStep(layerSamplingSteps, 'forest')
    const roadSamplingStep = resolveLayerSamplingStep(layerSamplingSteps, 'road')
    const goodRoadSamplingStep = resolveLayerSamplingStep(layerSamplingSteps, 'good_road')
    const riverSamplingStep = resolveLayerSamplingStep(layerSamplingSteps, 'river')

    const forestRaw = extractLayerPointsFromMask(parsedMask, 'forest', forestSamplingStep)
    const buildingComponentsRaw = extractLayerComponentsFromMask(parsedMask, 'building', 2)
    const redBuildingComponentsRaw = extractLayerComponentsFromMask(parsedMask, 'red_building', 2)
    const bridgeComponents = extractLayerComponentsFromMask(parsedMask, 'bridge', 2)
    const riverForBridge = extractLayerPointsFromMask(parsedMask, 'river', 1)
    const riverRaw = extractLayerPointsFromMask(parsedMask, 'river', riverSamplingStep)
    await this.yieldToMainThread()

    const roadDatasets = buildRoadDatasets(
      {
        road: extractLayerPointsFromMask(parsedMask, 'road', roadSamplingStep),
        goodRoad: extractLayerPointsFromMask(parsedMask, 'good_road', goodRoadSamplingStep),
        roadForBridge: extractLayerPointsFromMask(parsedMask, 'road', 1),
        goodRoadForBridge: extractLayerPointsFromMask(parsedMask, 'good_road', 1),
      },
      { passes: 1, minNeighborsToKeep: 2, minNeighborsToAdd: 6, minComponentSize: 4 }
    )
    await this.yieldToMainThread()

    const bridgeOccupancy = buildPixelOccupancyFromComponents(bridgeComponents, 2)
    const roadPointsForExclusion = roadDatasets.roadForBridge.points.concat(
      roadDatasets.goodRoadForBridge.points
    )
    const bridgeWaterConnectors = buildBridgeWaterConnectors(
      bridgeComponents,
      roadPointsForExclusion,
      riverForBridge.points
    )

    const effectiveRoadOccupancy = buildPixelOccupancyFromPoints(roadPointsForExclusion, 3)
    const buildingComponents = filterComponentsOutsideOccupancy(buildingComponentsRaw, bridgeOccupancy)
    const redBuildingComponents = filterComponentsOutsideOccupancy(
      redBuildingComponentsRaw,
      bridgeOccupancy
    )
    const buildingOccupancy = buildPixelOccupancyFromComponents(
      buildingComponents.concat(redBuildingComponents),
      3
    )
    const forest = {
      ...forestRaw,
      points: filterPointsOutsideOccupancy(
        filterPointsOutsideOccupancy(
          filterPointsOutsideOccupancy(forestRaw.points, bridgeOccupancy),
          effectiveRoadOccupancy
        ),
        buildingOccupancy
      ),
    }
    const road = {
      ...roadDatasets.road,
      points: filterPointsOutsideOccupancy(roadDatasets.road.points, bridgeOccupancy),
    }
    const goodRoad = {
      ...roadDatasets.goodRoad,
      points: filterPointsOutsideOccupancy(roadDatasets.goodRoad.points, bridgeOccupancy),
    }
    const river = {
      ...riverRaw,
      points: (() => {
        const filtered = filterPointsOutsideOccupancy(riverRaw.points, bridgeOccupancy)
        if (!bridgeWaterConnectors.length) return filtered
        const unique = new Set<string>()
        const merged: Array<[number, number]> = []
        const addPoint = (point: [number, number]) => {
          const px = Math.round(point[0])
          const py = Math.round(point[1])
          const key = `${px},${py}`
          if (unique.has(key)) return
          unique.add(key)
          merged.push([px, py])
        }
        for (let i = 0; i < filtered.length; i += 1) addPoint(filtered[i]!)
        for (let i = 0; i < bridgeWaterConnectors.length; i += 1) addPoint(bridgeWaterConnectors[i]!)
        return merged
      })(),
    }
    await this.yieldToMainThread()

    const buildingRoadPoints = road.points.concat(goodRoad.points)
    const forestTrees = addForestTrees(context, forest.points, {
      seed: 1,
      density: 0.5,
      clusterMeters: 32,
      jitterMeters: 1.5,
      minSpacingMeters: 5.5,
      placementJitterMeters: 3.2,
      baseHeight: worldInfo.objectSize * 3.1,
      baseRadius: worldInfo.objectSize * 0.15,
    })
    this.unitsLayer?.setForestPoints(forest.points, forestTrees.treePoints)
    const neutralBuildings = addBuildingsFromComponents(context, buildingComponents, buildingRoadPoints, {
      facadeStyle: 'plaster',
      floors: 2,
      floorHeight: worldInfo.objectSize * 2.025,
      roofHeight: worldInfo.objectSize * 0.55,
      roofScale: 1.09,
      material: { color: 0x8e8a82, roughness: 0.84, metalness: 0.02 },
      roofTextureStyle: 'wood',
      roofBaseColor: '#71563c',
      roofColor: 0x71563c,
      footprintScaleX: 1.12 * sampledPixelSpan,
      footprintScaleZ: 1.12 * sampledPixelSpan,
      maxFootprintMeters: worldInfo.objectSize * 6.8,
    })
    const redBuildings = addBuildingsFromComponents(context, redBuildingComponents, buildingRoadPoints, {
      facadeStyle: 'brick',
      floors: 3,
      floorHeight: worldInfo.objectSize * 1.995,
      roofHeight: worldInfo.objectSize * 0.5,
      roofScale: 1.07,
      facadeBaseColor: '#8a8175',
      brickAccentColor: 'rgba(74,66,58,0.38)',
      material: { color: 0x969086, roughness: 0.82, metalness: 0.02 },
      roofBaseColor: '#2c2f36',
      roofColor: 0x2c2f36,
      footprintScaleX: 1.1 * sampledPixelSpan,
      footprintScaleZ: 1.1 * sampledPixelSpan,
      maxFootprintMeters: worldInfo.objectSize * 6.2,
    })
    this.unitsLayer?.setBuildingAnchors(neutralBuildings.anchors.concat(redBuildings.anchors))
    addBridges(context, bridgeComponents, buildingRoadPoints, {
      material: { color: 0x8a6642, roughness: 0.85, metalness: 0.03 },
      deckThickness: worldInfo.objectSize * 0.3,
      deckEdgeHeight: worldInfo.objectSize * 0.2,
      deckRise: worldInfo.objectSize * 2.2,
      maxWidthPx: 4.2,
      roadWidthToBridgeWidthScale: 1.9,
    })
    await this.yieldToMainThread()

    renderRoadLayer(context, road.points, {
      seed: 9,
      density: 1,
      clusterMeters: 8,
      jitterMeters: 0,
      naturalDistribution: false,
      yBase: worldInfo.objectSize * 0.048,
      castShadow: false,
      receiveShadow: false,
      geometryFactory: () =>
        new THREE.BoxGeometry(
          worldInfo.objectSize * Math.max(1.2, sampledPixelSpan * 1.12),
          worldInfo.objectSize * 0.04,
          worldInfo.objectSize * Math.max(1.2, sampledPixelSpan * 1.12)
        ),
      materialFactory: createRoadMaterialFactory('dirt'),
    })
    renderRoadLayer(context, goodRoad.points, {
      seed: 11,
      density: 1,
      clusterMeters: 8,
      jitterMeters: 0,
      naturalDistribution: false,
      yBase: worldInfo.objectSize * 0.058,
      castShadow: false,
      receiveShadow: false,
      geometryFactory: () =>
        new THREE.BoxGeometry(
          worldInfo.objectSize * Math.max(1.2, sampledPixelSpan * 1.12),
          worldInfo.objectSize * 0.05,
          worldInfo.objectSize * Math.max(1.2, sampledPixelSpan * 1.12)
        ),
      materialFactory: createRoadMaterialFactory('stone'),
    })
    const allRoadPoints = road.points.concat(goodRoad.points)
    const goodRoadTransitionPoints = buildRoadTransitionPoints(goodRoad.points, allRoadPoints, [], 1)
    const roadTransitionPoints = buildRoadTransitionPoints(
      road.points,
      allRoadPoints,
      goodRoadTransitionPoints,
      2
    )
    renderRoadLayer(context, roadTransitionPoints, {
      seed: 21,
      density: 1,
      clusterMeters: 8,
      jitterMeters: 0,
      naturalDistribution: false,
      yBase: worldInfo.objectSize * 0.014,
      castShadow: false,
      receiveShadow: false,
      geometryFactory: () =>
        new THREE.BoxGeometry(
          worldInfo.objectSize * Math.max(1.52, sampledPixelSpan * 1.35),
          worldInfo.objectSize * 0.009,
          worldInfo.objectSize * Math.max(1.52, sampledPixelSpan * 1.35)
        ),
      materialFactory: createRoadTransitionMaterialFactory('dirt'),
    })
    renderRoadLayer(context, goodRoadTransitionPoints, {
      seed: 23,
      density: 1,
      clusterMeters: 8,
      jitterMeters: 0,
      naturalDistribution: false,
      yBase: worldInfo.objectSize * 0.02,
      castShadow: false,
      receiveShadow: false,
      geometryFactory: () =>
        new THREE.BoxGeometry(
          worldInfo.objectSize * Math.max(1.33, sampledPixelSpan * 1.2),
          worldInfo.objectSize * 0.01,
          worldInfo.objectSize * Math.max(1.33, sampledPixelSpan * 1.2)
        ),
      materialFactory: createRoadTransitionMaterialFactory('stone'),
    })
    await this.yieldToMainThread()
    const riverRender = addWaterLayer(context, river.points, {
      yBase: worldInfo.objectSize * 0.1,
      deepColor: 0x2a62ad,
      opacityDeep: 0.9,
    })
    this.waterUpdater = riverRender.update
    this.applyRadialFogToSceneMaterials()
    this.renderer.shadowMap.needsUpdate = true
  }

  private buildFallbackSceneFromMap() {
    if (!this.mapImage) return
    const mapSize = this.resolveImageSize(this.mapImage)
    const worldInfo = {
      width: mapSize.width,
      height: mapSize.height,
      cellSize: this.metersPerPixel,
      objectSize: this.metersPerPixel,
      sampledToSourceScale: 1,
    }
    this.lastMapWidth = worldInfo.width
    this.lastMapHeight = worldInfo.height
    this.sceneBounds = getSceneBounds(this.stage, worldInfo)
    this.sceneZoneBounds = getSceneZoneBounds(this.stage, worldInfo)

    const largestSceneSideMeters = this.resolveLargestSceneSideMeters()
    this.camera.position.set(
      (this.sceneBounds.minX + this.sceneBounds.maxX) / 2,
      worldInfo.objectSize * 20,
      (this.sceneBounds.minZ + this.sceneBounds.maxZ) / 2 + largestSceneSideMeters * 0.18
    )
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')

    this.viewDistance = THREE.MathUtils.clamp(
      largestSceneSideMeters * threeRenderer.VIEW_DISTANCE_MAP_FACTOR,
      threeRenderer.MIN_VIEW_DISTANCE,
      threeRenderer.MAX_VIEW_DISTANCE
    )
    this.updateVisibilityRanges()

    const halfW = () => worldInfo.width / 2
    const halfH = () => worldInfo.height / 2
    const context = {
      scene: this.objectsGroup,
      renderer: this.renderer,
      world: worldInfo,
      pixelToWorld: (px: number, py: number) => ({
        x: (px + 0.5 - halfW()) * worldInfo.cellSize,
        z: (py + 0.5 - halfH()) * worldInfo.cellSize,
      }),
      hash2D,
    }

    this.unitsLayer = createUnitsLayer(context)
    this.addMapTexturePlane(worldInfo.width, worldInfo.height)
    this.applyRadialFogToSceneMaterials()
    this.renderer.shadowMap.needsUpdate = true
  }

  private clearObjects() {
    this.unitsLayer?.dispose()
    this.unitsLayer = null
    const toDispose: THREE.Object3D[] = []
    this.objectsGroup.traverse((obj: THREE.Object3D) => toDispose.push(obj))
    for (const obj of toDispose) {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    }
    this.objectsGroup.clear()
  }

  private resolveMinimapStaticCanvas() {
    const key = getSceneActiveZoneKey(this.stage)
    if (this.minimapStaticCanvas && this.minimapStaticKey === key) return this.minimapStaticCanvas
    this.minimapStaticCanvas = this.buildMinimapStaticCanvas()
    this.minimapStaticKey = key
    return this.minimapStaticCanvas
  }

  // Миникарта показывает ту же область, что и сцена, поэтому режется по тем же
  // границам: из полной картинки берём только кусок под активными зонами.
  private buildMinimapStaticCanvas() {
    const img = this.mapImage
    if (!img) return null
    const src = img as ImageBitmap
    const mapWidth = src.width || this.lastMapWidth
    const mapHeight = src.height || this.lastMapHeight

    const bounds = this.resolveSceneBounds()
    const sx = bounds.minX / this.metersPerPixel + mapWidth / 2
    const sy = bounds.minZ / this.metersPerPixel + mapHeight / 2
    const sw = (bounds.maxX - bounds.minX) / this.metersPerPixel
    const sh = (bounds.maxZ - bounds.minZ) / this.metersPerPixel
    if (!(sw > 0) || !(sh > 0)) return null

    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(sw))
    c.height = Math.max(1, Math.round(sh))
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
    return c
  }

  private resolveImageSize(img: CanvasImageSource) {
    const bitmapLike = img as { width?: unknown; height?: unknown }
    const width = Math.max(1, Number(bitmapLike.width) || this.lastMapWidth || 1)
    const height = Math.max(1, Number(bitmapLike.height) || this.lastMapHeight || 1)
    return {
      width,
      height,
    }
  }

  // По плоскости на активную зону: каждая берёт из общей текстуры карты свой
  // кусок через offset/repeat, поэтому вне зон карта не показывается.
  private addMapTexturePlane(mapWidthPx: number, mapHeightPx: number) {
    if (!this.mapImage) return

    const mapWidthMeters = mapWidthPx * this.metersPerPixel
    const mapHeightMeters = mapHeightPx * this.metersPerPixel

    for (let i = 0; i < this.sceneZoneBounds.length; i += 1) {
      const zone = this.sceneZoneBounds[i]!
      const planeWidth = zone.maxX - zone.minX
      const planeDepth = zone.maxZ - zone.minZ
      if (!(planeWidth > 0) || !(planeDepth > 0)) continue

      const maxWorldSideCells = Math.max(planeWidth, planeDepth) / this.metersPerPixel
      const planeSegments = Math.max(16, Math.min(220, Math.round(maxWorldSideCells / 28)))

      const mapTexture = new THREE.Texture(this.mapImage)
      mapTexture.colorSpace = THREE.SRGBColorSpace
      mapTexture.wrapS = THREE.ClampToEdgeWrapping
      mapTexture.wrapT = THREE.ClampToEdgeWrapping
      mapTexture.minFilter = THREE.LinearMipmapLinearFilter
      mapTexture.magFilter = THREE.LinearFilter
      mapTexture.generateMipmaps = true
      mapTexture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy())
      // Ось V текстуры направлена вверх, а Z сцены — вниз, отсюда 1 - maxZ.
      mapTexture.repeat.set(planeWidth / mapWidthMeters, planeDepth / mapHeightMeters)
      mapTexture.offset.set(
        (zone.minX + mapWidthMeters / 2) / mapWidthMeters,
        1 - (zone.maxZ + mapHeightMeters / 2) / mapHeightMeters
      )
      mapTexture.needsUpdate = true

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(planeWidth, planeDepth, planeSegments, planeSegments),
        new THREE.MeshStandardMaterial({
          map: mapTexture,
          color: 0xffffff,
          roughness: 0.98,
          metalness: 0.0,
        })
      )
      plane.rotation.x = -Math.PI / 2
      // Земля из makeGround стоит на тех же высотах, карту кладём поверх неё.
      plane.position.set(
        (zone.minX + zone.maxX) / 2,
        (this.sceneZoneBounds.length + i) * 0.01,
        (zone.minZ + zone.maxZ) / 2
      )
      plane.receiveShadow = true
      this.objectsGroup.add(plane)
    }
  }

  private getVisibilityRadiusMeters() {
    return Math.max(this.metersPerPixel * 8, this.viewDistance * threeRenderer.FOG_FAR_FACTOR)
  }

  private bindInput() {
    const onCanvasClick = (event: MouseEvent) => {
      if (event.button === 0 && this.handleMinimapClick(event)) return
      this.canvas.requestPointerLock()
    }
    const onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas
    }
    const onMouseMove = (event: MouseEvent) => {
      if (!this.pointerLocked) return
      const sensitivity = 0.0022
      this.yaw -= event.movementX * sensitivity
      this.pitch -= event.movementY * sensitivity
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      this.keyState[event.code] = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      this.keyState[event.code] = false
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const normalizedDelta = THREE.MathUtils.clamp(event.deltaY / 120, -4, 4)
      if (normalizedDelta === 0) return
      const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation).normalize()
      const cameraSpeedMultiplier = this.getCameraSpeedMultiplierByAltitude()
      const stepMeters = Math.max(this.metersPerPixel * 1.5, this.camera.position.y * 0.08) * cameraSpeedMultiplier
      const moveAmount = -normalizedDelta * stepMeters
      this.camera.position.addScaledVector(forward, moveAmount)
      this.clampCameraToWorldBounds()
    }

    this.canvas.addEventListener('click', onCanvasClick)
    this.canvas.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mousemove', onMouseMove)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    this.removeListeners.push(() => this.canvas.removeEventListener('click', onCanvasClick))
    this.removeListeners.push(() =>
      document.removeEventListener('pointerlockchange', onPointerLockChange)
    )
    this.removeListeners.push(() => this.canvas.removeEventListener('wheel', onWheel))
    this.removeListeners.push(() => document.removeEventListener('mousemove', onMouseMove))
    this.removeListeners.push(() => window.removeEventListener('keydown', onKeyDown))
    this.removeListeners.push(() => window.removeEventListener('keyup', onKeyUp))
  }

  private resolveMinimapLayout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssWidth = this.overlayCanvas.clientWidth || Math.round(this.overlayCanvas.width / dpr)
    const cssHeight = this.overlayCanvas.clientHeight || Math.round(this.overlayCanvas.height / dpr)
    const minimapWidth = Math.min(220, Math.round(cssWidth * 0.18))
    const minimapHeight = Math.min(220, Math.round(cssHeight * 0.18))
    const x = Math.max(
      12,
      cssWidth - minimapWidth - threeRenderer.MINIMAP_RIGHT_MARGIN
    )
    const y = threeRenderer.MINIMAP_TOP_MARGIN
    return { cssWidth, cssHeight, minimapWidth, minimapHeight, x, y }
  }

  private handleMinimapClick(event: MouseEvent) {
    const { minimapWidth, minimapHeight, x, y } = this.resolveMinimapLayout()
    const rect = this.canvas.getBoundingClientRect()
    const localX = event.clientX - rect.left
    const localY = event.clientY - rect.top
    const insideX = localX >= x && localX <= x + minimapWidth
    const insideY = localY >= y && localY <= y + minimapHeight
    if (!insideX || !insideY) return false

    const bounds = this.resolveSceneBounds()
    const worldWidth = bounds.maxX - bounds.minX
    const worldHeight = bounds.maxZ - bounds.minZ
    if (!(worldWidth > 0) || !(worldHeight > 0)) return false

    const nx = THREE.MathUtils.clamp((localX - x) / Math.max(1, minimapWidth), 0, 1)
    const ny = THREE.MathUtils.clamp((localY - y) / Math.max(1, minimapHeight), 0, 1)
    this.camera.position.x = bounds.minX + nx * worldWidth
    this.camera.position.z = bounds.minZ + ny * worldHeight
    return true
  }

  private updateFlight(deltaSeconds: number) {
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0))
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0))
    const moveDirection = new THREE.Vector3()
    if (this.keyState.KeyW) moveDirection.add(forward)
    if (this.keyState.KeyS) moveDirection.sub(forward)
    if (this.keyState.KeyD) moveDirection.add(right)
    if (this.keyState.KeyA) moveDirection.sub(right)
    if (moveDirection.lengthSq() > 0) moveDirection.normalize()
    const cameraSpeedMultiplier = this.getCameraSpeedMultiplierByAltitude()
    const speed =
      this.keyState.ControlLeft || this.keyState.ControlRight
        ? 60 * this.metersPerPixel * cameraSpeedMultiplier
        : 30 * this.metersPerPixel * cameraSpeedMultiplier
    const wasdSpeed = speed * 3
    const verticalSpeed = speed * 5
    this.camera.position.addScaledVector(moveDirection, wasdSpeed * deltaSeconds)
    if (this.keyState.Space) this.camera.position.y += verticalSpeed * deltaSeconds
    if (this.keyState.ShiftLeft || this.keyState.ShiftRight)
      this.camera.position.y -= verticalSpeed * deltaSeconds
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    this.clampCameraToWorldBounds()
  }

  private getCameraSpeedMultiplierByAltitude() {
    const minAltitude = this.metersPerPixel * 2
    const maxAltitude = Math.max(minAltitude + this.metersPerPixel, this.viewDistance * 0.2)
    const altitude = THREE.MathUtils.clamp(this.camera.position.y, minAltitude, maxAltitude)
    const altitudeT = (altitude - minAltitude) / Math.max(this.metersPerPixel, maxAltitude - minAltitude)
    return THREE.MathUtils.lerp(
      threeRenderer.CAMERA_SPEED_NEAR_MULTIPLIER,
      threeRenderer.CAMERA_SPEED_FAR_MULTIPLIER,
      altitudeT
    )
  }

  /**
   * Область сцены, доступная камере: активные зоны, а без них — вся карта.
   * Пересчитывается по требованию, потому что размер карты приезжает из render().
   */
  private resolveSceneBounds(): SceneBounds {
    return (
      this.sceneBounds ??
      getSceneBounds(this.stage, {
        width: this.lastMapWidth,
        height: this.lastMapHeight,
        cellSize: this.metersPerPixel,
      })
    )
  }

  private resolveLargestSceneSideMeters() {
    const bounds = this.resolveSceneBounds()
    return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)
  }

  private clampCameraToWorldBounds() {
    const bounds = this.resolveSceneBounds()
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, bounds.minX, bounds.maxX)
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, bounds.minZ, bounds.maxZ)
    this.camera.position.y = Math.max(this.metersPerPixel * 1.5, this.camera.position.y)
  }

  private updateVisibilityRanges() {
    const fogGroundFar = this.viewDistance * threeRenderer.FOG_FAR_FACTOR
    const fogGroundNear = this.viewDistance * threeRenderer.FOG_NEAR_FACTOR
    // Radial fog uses view-space distance directly, so keep fog radii fixed in world meters.
    const fogFar = fogGroundFar
    const fogNear = fogGroundNear
    const halfVerticalFovRad = THREE.MathUtils.degToRad(this.camera.fov * 0.5)
    const tanHalfVertical = Math.tan(halfVerticalFovRad)
    const tanHalfHorizontal = tanHalfVertical * Math.max(1, this.camera.aspect)
    // Three.js clips by camera-space Z, so with a tight far plane the corners can
    // expose farther terrain than the center. Keep far clip beyond fog in corners
    // and let fog define the practical render distance uniformly.
    const cornerFarMultiplier = Math.sqrt(1 + tanHalfHorizontal ** 2 + tanHalfVertical ** 2)
    this.camera.far = Math.max(this.viewDistance * 4, fogFar * cornerFarMultiplier * 1.05)
    this.camera.updateProjectionMatrix()
    if (this.scene.fog instanceof THREE.Fog) {
      // Keep ground-plane visibility stable when camera changes altitude.
      this.scene.fog.near = fogNear
      this.scene.fog.far = fogFar
    }
  }

  private applyRadialFogToSceneMaterials() {
    if (!threeRenderer.HORIZONTAL_FOG_ENABLED) return
    this.objectsGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (!material) return
      if (Array.isArray(material)) {
        for (let i = 0; i < material.length; i += 1) this.patchMaterialFogDepthToRadial(material[i]!)
        return
      }
      this.patchMaterialFogDepthToRadial(material)
    })
  }

  private patchMaterialFogDepthToRadial(material: THREE.Material) {
    const marker = '__radialFogPatched'
    if ((material.userData as Record<string, unknown>)[marker]) return
    const previousOnBeforeCompile = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) => {
      previousOnBeforeCompile(shader, renderer)
      const includeToken = '#include <fog_vertex>'
      if (!shader.vertexShader.includes(includeToken)) return
      shader.vertexShader = shader.vertexShader.replace(
        includeToken,
        `#ifdef USE_FOG
  vec3 fogTransformed = transformed;
  #ifdef USE_INSTANCING
    fogTransformed = (instanceMatrix * vec4(fogTransformed, 1.0)).xyz;
  #endif
  vec4 fogWorldPosition = modelMatrix * vec4(fogTransformed, 1.0);
  vFogDepth = length(fogWorldPosition.xz - cameraPosition.xz);
#endif`
      )
    }
    ;(material.userData as Record<string, unknown>)[marker] = true
    material.needsUpdate = true
  }

  private async yieldToMainThread() {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
}

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import GameUi from '@/components/gameUI.vue'
import { Team } from '@/enums/teamKeys'
import { GameSocket } from '@/api/socket.ts'
import type { RoomData } from '@/structures/room'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'
import type { GameLoadingStage, GameLoadingState } from '@/components/room/loading'

import {
  type EngineRenderer,
  type RenderBackend,
  type RenderSceneAssets,
  InputOrchestrator,
  loadImageWithProgress,
  RenderOrchestrator,
  type mapmeta,
  world,
} from '@/engine'

import { buildForestMap } from '@/engine/assets/mapforest.ts'
import { preloadTextures } from '@/engine/assets/textures.ts'
import { loadResourcePack } from '@/engine/assets/resourcepack.ts'
import { toProxyAssetUrl } from '@/engine/assets/proxy.ts'

const props = defineProps<{
  room: RoomData
  team: Team
  userId?: number | null
}>()

const emit = defineEmits<{
  (e: 'progress', value: GameLoadingState): void
  (e: 'ready', w: world): void
  (e: 'error', i18nKey: string, url?: string): void
}>()

const canvas2dEl = ref<HTMLCanvasElement | null>(null)
const canvas2dOverlayEl = ref<HTMLCanvasElement | null>(null)
const canvas3dEl = ref<HTMLCanvasElement | null>(null)
const canvas3dOverlayEl = ref<HTMLCanvasElement | null>(null)

let w: world | null = null
let renderer: EngineRenderer | null = null
const rendererCache: Partial<Record<RenderBackend, EngineRenderer>> = {}
const rendererAssetsRef: Partial<Record<RenderBackend, RenderSceneAssets | null>> = {}
let rafId: number | null = null
let resizeHandler: (() => void) | null = null
let socket: GameSocket | null = null
let cameraPersistTimer: number | null = null
let teardown2DInput: (() => void) | null = null
let sceneAssets: RenderSceneAssets | null = null
let loadingStages: GameLoadingStage[] = []
let isBackendMounting = false

const renderOrchestrator = new RenderOrchestrator('2d')
const inputOrchestrator = new InputOrchestrator('2d')
const { t } = useI18n()

const ready = ref(false)
const currentBackend = ref<RenderBackend>('2d')
const displayedBackend = ref<RenderBackend>(currentBackend.value)
const isInitial3DLoad = ref(false)
const CAMERA_STATE_EPSILON = 0.0001
const LOAD_DEBUG_PREFIX = '[LoadDebug]'
const SWITCH_TO_3D_PITCH = -Math.PI / 2 + 0.05
const THREE_CAMERA_FOV_DEG = 58
const showBackendSwitchOverlay = computed(
  () => isInitial3DLoad.value && currentBackend.value === '3d'
)

function allow3DRender() {
  return props.team === Team.ADMIN
}

type Camera2DState = {
  x: number
  y: number
  zoom: number
}

type Camera3DState = {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

let runtime2DCameraState: Camera2DState | null = null
let runtime3DCameraState: Camera3DState | null = null

function debugLoad(message: string, payload?: Record<string, unknown>) {
  if (payload) {
    console.log(`${LOAD_DEBUG_PREFIX} ${message}`, payload)
    return
  }
  console.log(`${LOAD_DEBUG_PREFIX} ${message}`)
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return numeric
}

function resolveRoomMetersPerPixel(
  roomOptions: Record<string, unknown>,
  objectMapMeta: Record<string, unknown> | null,
  fallback: number
) {
  const fromRoomSettings =
    asPositiveNumber(roomOptions[ROOM_SETTING_KEYS.MAP_METERS_PER_PIXEL]) ??
    asPositiveNumber(roomOptions.metersPerPixel)
  if (fromRoomSettings != null) return fromRoomSettings

  // Legacy object-map metadata key used by the old 3D toolchain.
  const fromObjectMeta =
    asPositiveNumber(objectMapMeta?.metersPerPixel) ??
    asPositiveNumber(objectMapMeta?.metersInPixel)
  if (fromObjectMeta != null) return fromObjectMeta

  return fallback
}

function normalizeAssetUrl(url: unknown): string {
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  try {
    return new URL(trimmed, location.origin).href
  } catch {
    return trimmed
  }
}

function initLoading(stageDefs: Array<{ key: string; labelKey: string }>) {
  loadingStages = stageDefs.map((stage) => ({
    key: stage.key,
    labelKey: stage.labelKey,
    progress: 0,
  }))
  emitLoading()
}

function setStageProgress(stageKey: string, progress: number) {
  const stage = loadingStages.find((s) => s.key === stageKey)
  if (!stage) return
  stage.progress = Math.max(0, Math.min(100, progress))
  emitLoading(stageKey)
}

function markStageDone(stageKey: string) {
  setStageProgress(stageKey, 100)
}

function emitLoading(activeStageKey: string | null = null) {
  if (!loadingStages.length) return
  const total =
    loadingStages.reduce((sum, stage) => sum + stage.progress, 0) /
    Math.max(1, loadingStages.length)
  emit('progress', {
    totalProgress: total,
    activeStageKey,
    stages: loadingStages.slice(),
  })
}

async function runStageWithPulse<T>(
  stageKey: string,
  startProgress: number,
  pulseMaxProgress: number,
  task: () => Promise<T>,
  pulseIntervalMs = 180
) {
  const stageStartedAt = performance.now()
  debugLoad(`stage:${stageKey}:start`, {
    startProgress,
    pulseMaxProgress,
  })
  const start = Math.max(0, Math.min(100, startProgress))
  const maxPulse = Math.max(start, Math.min(99, pulseMaxProgress))
  let localProgress = start
  setStageProgress(stageKey, localProgress)

  const timer = window.setInterval(() => {
    localProgress = Math.min(maxPulse, localProgress + (localProgress < 55 ? 3 : 1))
    setStageProgress(stageKey, localProgress)
  }, pulseIntervalMs)

  try {
    const result = await task()
    debugLoad(`stage:${stageKey}:done`, {
      elapsedMs: Math.round(performance.now() - stageStartedAt),
    })
    return result
  } finally {
    clearInterval(timer)
  }
}

function isCameraClose(a: number, b: number) {
  return Math.abs(a - b) < CAMERA_STATE_EPSILON
}

function readSaved2DCameraState(currentRoomId: string): Camera2DState | null {
  const savedRoomId = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_ROOM_ID]
  if (savedRoomId !== currentRoomId) return null

  const savedX = asFiniteNumber(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_X]
  )
  const savedY = asFiniteNumber(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_Y]
  )
  const savedZoom = asFiniteNumber(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_ZOOM]
  )

  if (savedX == null || savedY == null || savedZoom == null) return null

  return {
    x: savedX,
    y: savedY,
    zoom: savedZoom,
  }
}

function writeSaved2DCameraState(currentRoomId: string, state: Camera2DState) {
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_ROOM_ID] = currentRoomId
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_X] = state.x
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_Y] = state.y
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_ZOOM] = state.zoom
}

function apply2DCameraState(currentWorld: world, state: Camera2DState) {
  currentWorld.camera.zoom = state.zoom
  currentWorld.camera.pos.x = state.x
  currentWorld.camera.pos.y = state.y
  currentWorld.camera.clampToWorld()
}

function convert2DTo3DCameraState(currentWorld: world, state2D: Camera2DState): Camera3DState {
  const metersPerPixel = Math.max(
    0.01,
    Number(sceneAssets?.metersPerPixel || currentWorld.map.metersPerPixel || 1)
  )
  const safeZoom = Math.max(0.01, state2D.zoom)
  const centerX = state2D.x + currentWorld.camera.viewport.x / Math.max(2 * state2D.zoom, 0.0001)
  const centerY = state2D.y + currentWorld.camera.viewport.y / Math.max(2 * state2D.zoom, 0.0001)
  const x = (centerX - currentWorld.map.width / 2) * metersPerPixel
  const z = (centerY - currentWorld.map.height / 2) * metersPerPixel
  const visibleHeightMeters = (currentWorld.camera.viewport.y / safeZoom) * metersPerPixel
  const fovRad = (THREE_CAMERA_FOV_DEG * Math.PI) / 180
  const y = Math.max(
    metersPerPixel * 1.5,
    visibleHeightMeters / Math.max(2 * Math.tan(fovRad / 2), 0.0001)
  )

  return {
    x,
    y,
    z,
    yaw: 0,
    pitch: SWITCH_TO_3D_PITCH,
  }
}

function convert3DTo2DCameraState(
  currentWorld: world,
  state3D: Camera3DState,
  zoom: number
): Camera2DState {
  const metersPerPixel = Math.max(
    0.01,
    Number(sceneAssets?.metersPerPixel || currentWorld.map.metersPerPixel || 1)
  )
  const safeZoom = Math.max(0.01, zoom)
  const centerX = state3D.x / metersPerPixel + currentWorld.map.width / 2
  const centerY = state3D.z / metersPerPixel + currentWorld.map.height / 2
  const x = centerX - currentWorld.camera.viewport.x / (2 * safeZoom)
  const y = centerY - currentWorld.camera.viewport.y / (2 * safeZoom)

  const state: Camera2DState = {
    x,
    y,
    zoom: safeZoom,
  }
  apply2DCameraState(currentWorld, state)
  return {
    x: currentWorld.camera.pos.x,
    y: currentWorld.camera.pos.y,
    zoom: currentWorld.camera.zoom,
  }
}

function readCurrent3DCameraState(): Camera3DState | null {
  if (!renderer?.getCameraState) return null
  const state = renderer.getCameraState() as Partial<Camera3DState> | null
  if (!state) return null
  const x = asFiniteNumber(state.x)
  const y = asFiniteNumber(state.y)
  const z = asFiniteNumber(state.z)
  const yaw = asFiniteNumber(state.yaw)
  const pitch = asFiniteNumber(state.pitch)
  if (x == null || y == null || z == null || yaw == null || pitch == null) return null
  return {
    x,
    y,
    z,
    yaw,
    pitch,
  }
}

function captureCameraState(backend: RenderBackend, currentRoomId: string, currentWorld: world) {
  if (backend === '2d') {
    const state: Camera2DState = {
      x: currentWorld.camera.pos.x,
      y: currentWorld.camera.pos.y,
      zoom: currentWorld.camera.zoom,
    }
    runtime2DCameraState = state
    writeSaved2DCameraState(currentRoomId, state)
    return
  }

  const state3D = readCurrent3DCameraState()
  if (!state3D) return
  runtime3DCameraState = state3D
}

function syncCameraBetweenBackends(
  fromBackend: RenderBackend,
  toBackend: RenderBackend,
  currentRoomId: string,
  currentWorld: world
) {
  if (fromBackend === toBackend) return

  if (fromBackend === '2d' && toBackend === '3d') {
    const state2D: Camera2DState = {
      x: currentWorld.camera.pos.x,
      y: currentWorld.camera.pos.y,
      zoom: currentWorld.camera.zoom,
    }
    runtime2DCameraState = state2D
    writeSaved2DCameraState(currentRoomId, state2D)
    const projected3D = convert2DTo3DCameraState(currentWorld, state2D)
    runtime3DCameraState = projected3D
    return
  }

  if (fromBackend === '3d' && toBackend === '2d') {
    const state3D = readCurrent3DCameraState()
    if (!state3D) return
    runtime3DCameraState = state3D

    const preferredZoom =
      runtime2DCameraState?.zoom ??
      readSaved2DCameraState(currentRoomId)?.zoom ??
      currentWorld.camera.zoom
    const projected2D = convert3DTo2DCameraState(currentWorld, state3D, preferredZoom)
    runtime2DCameraState = projected2D
    writeSaved2DCameraState(currentRoomId, projected2D)
  }
}

function restoreCameraStateForBackend(
  backend: RenderBackend,
  currentRoomId: string,
  currentWorld: world
) {
  if (backend === '2d') {
    const state = runtime2DCameraState ?? readSaved2DCameraState(currentRoomId)
    if (!state) return
    apply2DCameraState(currentWorld, state)
    return
  }

  const stateFrom3DStorage =
    runtime3DCameraState ??
    (() => {
      const fallback2D = runtime2DCameraState ?? readSaved2DCameraState(currentRoomId)
      if (!fallback2D) return null
      return convert2DTo3DCameraState(currentWorld, fallback2D)
    })()

  if (!stateFrom3DStorage) return
  renderer?.setCameraState?.(stateFrom3DStorage)
}

function startCameraStatePersistence(currentRoomId: string, currentWorld: world) {
  if (cameraPersistTimer != null) {
    clearInterval(cameraPersistTimer)
  }

  cameraPersistTimer = window.setInterval(() => {
    if (isBackendMounting) return

    if (currentBackend.value === '2d') {
      const cam = currentWorld.camera
      const savedState = readSaved2DCameraState(currentRoomId)
      const hasSameCamera =
        savedState != null &&
        isCameraClose(savedState.x, cam.pos.x) &&
        isCameraClose(savedState.y, cam.pos.y) &&
        isCameraClose(savedState.zoom, cam.zoom)
      if (hasSameCamera) return
      const state: Camera2DState = {
        x: cam.pos.x,
        y: cam.pos.y,
        zoom: cam.zoom,
      }
      runtime2DCameraState = state
      writeSaved2DCameraState(currentRoomId, state)
      return
    }

    const state3D = readCurrent3DCameraState()
    if (!state3D) return
    const savedState3D = runtime3DCameraState
    const hasSame3DCamera =
      savedState3D != null &&
      isCameraClose(savedState3D.x, state3D.x) &&
      isCameraClose(savedState3D.y, state3D.y) &&
      isCameraClose(savedState3D.z, state3D.z) &&
      isCameraClose(savedState3D.yaw, state3D.yaw) &&
      isCameraClose(savedState3D.pitch, state3D.pitch)
    if (hasSame3DCamera) return
    runtime3DCameraState = state3D
  }, 1000)
}

function cleanup() {
  if (w && renderer) {
    const currentRoomId = String(w.id || props.room.uuid)
    captureCameraState(currentBackend.value, currentRoomId, w)
  }

  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }

  socket?.disconnect()
  socket = null

  teardown2DInput?.()
  teardown2DInput = null

  const disposed = new Set<EngineRenderer>()
  for (const backend of ['2d', '3d'] as const) {
    const cachedRenderer = rendererCache[backend]
    if (!cachedRenderer || disposed.has(cachedRenderer)) continue
    cachedRenderer.dispose?.()
    disposed.add(cachedRenderer)
    delete rendererCache[backend]
    delete rendererAssetsRef[backend]
  }
  if (renderer && !disposed.has(renderer)) {
    renderer.dispose?.()
  }

  if (cameraPersistTimer != null) {
    clearInterval(cameraPersistTimer)
    cameraPersistTimer = null
  }

  renderer = null
  w = null
  ready.value = false
}

async function loadJsonWithFallback(url: string) {
  const toAbsoluteUrl = (value: string) => {
    try {
      return new URL(value, window.location.href).toString()
    } catch {
      return value
    }
  }

  const loadSlimMetaInWorker = async <T extends Record<string, unknown>>(targetUrl: string): Promise<T> => {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      const response = await fetch(targetUrl)
      if (!response.ok) throw new Error('object_map_meta_load_failed')
      const parsed = (await response.json()) as Record<string, unknown>
      const entityToColorRaw =
        parsed && typeof parsed === 'object'
          ? (parsed.entity_to_color as Record<string, unknown>)
          : null
      const entityToColor: Record<string, [number, number, number]> = {}
      if (entityToColorRaw && typeof entityToColorRaw === 'object') {
        for (const key of Object.keys(entityToColorRaw)) {
          const color = entityToColorRaw[key]
          if (!Array.isArray(color) || color.length < 3) continue
          const r = Number(color[0])
          const g = Number(color[1])
          const b = Number(color[2])
          if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue
          entityToColor[key] = [
            Math.max(0, Math.min(255, Math.round(r))),
            Math.max(0, Math.min(255, Math.round(g))),
            Math.max(0, Math.min(255, Math.round(b))),
          ]
        }
      }
      return ({
        entity_to_color: entityToColor,
        time: parsed?.time ?? parsed?.sunTime ?? parsed?.timeHours,
      } as unknown) as T
    }

    const workerSource = `
self.onmessage = async (event) => {
  try {
    const response = await fetch(event.data)
    if (!response.ok) throw new Error('object_map_meta_load_failed')
    const parsed = await response.json()
    const entityToColorRaw =
      parsed && typeof parsed === 'object' ? parsed.entity_to_color : null
    const entityToColor = {}
    if (entityToColorRaw && typeof entityToColorRaw === 'object') {
      const keys = Object.keys(entityToColorRaw)
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]
        const color = entityToColorRaw[key]
        if (!Array.isArray(color) || color.length < 3) continue
        const r = Number(color[0])
        const g = Number(color[1])
        const b = Number(color[2])
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue
        entityToColor[key] = [
          Math.max(0, Math.min(255, Math.round(r))),
          Math.max(0, Math.min(255, Math.round(g))),
          Math.max(0, Math.min(255, Math.round(b))),
        ]
      }
    }
    self.postMessage({
      ok: true,
      data: {
        entity_to_color: entityToColor,
        time: parsed?.time ?? parsed?.sunTime ?? parsed?.timeHours,
      },
    })
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'json_parse_failed',
    })
  }
}
`
    const blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' }))

    try {
      const parsed = await new Promise<T>((resolve, reject) => {
        const worker = new Worker(blobUrl)
        worker.onmessage = (event: MessageEvent<{ ok: boolean; data?: T; error?: string }>) => {
          worker.terminate()
          if (event.data?.ok) {
            resolve(event.data.data as T)
            return
          }
          reject(new Error(event.data?.error || 'json_parse_failed'))
        }
        worker.onerror = () => {
          worker.terminate()
          reject(new Error('json_parse_failed'))
        }
        worker.postMessage(targetUrl)
      })
      return parsed
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  const tryLoad = async (targetUrl: string) => {
    const startedAt = performance.now()
    debugLoad('objectMapMeta:request:start', { targetUrl })
    return await loadSlimMetaInWorker<Record<string, unknown>>(toAbsoluteUrl(targetUrl))
      .then((meta) => {
        debugLoad('objectMapMeta:request:done', {
          elapsedMs: Math.round(performance.now() - startedAt),
          keys: Object.keys(meta),
          entityCount: Object.keys((meta.entity_to_color as Record<string, unknown> | undefined) ?? {})
            .length,
        })
        return meta
      })
  }

  try {
    return await tryLoad(url)
  } catch {
    debugLoad('objectMapMeta:request:fallback')
    const proxyUrl = toProxyAssetUrl(url)
    if (!proxyUrl) throw new Error('object_map_meta_load_failed')
    return await tryLoad(proxyUrl)
  }
}

async function mountActiveBackend() {
  const startedAt = performance.now()
  debugLoad('mountActiveBackend:start', { backend: currentBackend.value })
  if (!w || !sceneAssets) return
  if (!allow3DRender() && currentBackend.value === '3d') {
    currentBackend.value = '2d'
  }
  const canvas = currentBackend.value === '3d' ? canvas3dEl.value : canvas2dEl.value
  const overlayCanvas =
    currentBackend.value === '3d' ? canvas3dOverlayEl.value : canvas2dOverlayEl.value
  if (!canvas || !overlayCanvas) return
  const currentRoomId = String(w.id || props.room.uuid)
  isBackendMounting = true
  const isFirst3DInit = currentBackend.value === '3d' && !rendererCache['3d']
  if (isFirst3DInit) {
    isInitial3DLoad.value = true
  }
  const previousRenderer = renderer
  let nextRenderer: EngineRenderer | null = null
  let rendererSwapped = false
  let createdRenderer = false

  try {
    renderOrchestrator.setBackend(currentBackend.value)
    inputOrchestrator.setBackend(currentBackend.value)

    nextRenderer = rendererCache[currentBackend.value] ?? null
    if (!nextRenderer) {
      nextRenderer = renderOrchestrator.createRenderer(canvas, overlayCanvas)
      rendererCache[currentBackend.value] = nextRenderer
      createdRenderer = true
    }
    if (createdRenderer || rendererAssetsRef[currentBackend.value] !== sceneAssets) {
      nextRenderer.setMapImage(sceneAssets.mapImage)
      await nextRenderer.setSceneAssets?.(sceneAssets)
      rendererAssetsRef[currentBackend.value] = sceneAssets
    }
    renderer = nextRenderer
    rendererSwapped = true

    teardown2DInput?.()
    teardown2DInput = null
    teardown2DInput = inputOrchestrator.mount(canvas, w)
    restoreCameraStateForBackend(currentBackend.value, currentRoomId, w)

    renderer.resize(window.innerWidth, window.innerHeight)
    renderer.render(w)
    renderer.renderOverlay(w)
    displayedBackend.value = currentBackend.value
    debugLoad('mountActiveBackend:done', {
      elapsedMs: Math.round(performance.now() - startedAt),
      backend: currentBackend.value,
      reusedRenderer: !createdRenderer,
    })
  } catch (error) {
    if (!rendererSwapped && createdRenderer && nextRenderer) {
      nextRenderer.dispose?.()
      if (rendererCache[currentBackend.value] === nextRenderer) {
        delete rendererCache[currentBackend.value]
      }
      delete rendererAssetsRef[currentBackend.value]
    }
    renderer = previousRenderer
    throw error
  } finally {
    isBackendMounting = false
    if (isFirst3DInit) {
      isInitial3DLoad.value = false
    }
  }
}

async function initWorld(room: RoomData) {
  const initStartedAt = performance.now()
  debugLoad('initWorld:start', { roomId: String(room.uuid) })
  cleanup()

  let defaultMapUrl =
    'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg'
  let defaultHeightMapUrl =
    'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_height_map.png'
  let defaultMetersPerPixel = 5.38
  let defaultResourcePackUrl =
    `${location.origin}/assets/default_resourcepack.json`
  const defaultObjectMapUrl = `${location.origin}/assets/default_map_objects.png`
  const defaultObjectMapMetaUrl = `${location.origin}/assets/default_map_objects_meta.json`

  if (window.location.hostname === 'localhost') {
    room.options.mapUrl = ''
    defaultMapUrl = '/assets/default_map.jpeg'
    defaultHeightMapUrl = '/assets/default_height_map.png'
    defaultResourcePackUrl = '/assets/default_resourcepack.json'
    room.options[ROOM_SETTING_KEYS.OBJECT_MAP_URL] = '/assets/default_map_objects.png'
    room.options[ROOM_SETTING_KEYS.OBJECT_MAP_META_URL] =
      '/assets/default_map_objects_meta.json'
    room.options[ROOM_SETTING_KEYS.RESOURCE_PACK_URL] = defaultResourcePackUrl
  }

  if (!room.options.mapUrl) {
    room.options.mapUrl = defaultMapUrl
    room.options.heightMapUrl = defaultHeightMapUrl
    room.options[ROOM_SETTING_KEYS.MAP_METERS_PER_PIXEL] = defaultMetersPerPixel
  }

  const defaultMapUrls = new Set([
    normalizeAssetUrl(defaultMapUrl),
    normalizeAssetUrl('/assets/default_map.jpeg'),
    normalizeAssetUrl('https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg'),
  ])
  const isDefaultMapSelected = defaultMapUrls.has(normalizeAssetUrl(String(room.options.mapUrl || '')))

  const configuredObjectMapUrl = String(room.options[ROOM_SETTING_KEYS.OBJECT_MAP_URL] || '').trim()
  const configuredObjectMapMetaUrl = String(room.options[ROOM_SETTING_KEYS.OBJECT_MAP_META_URL] || '').trim()

  const canUse3D = allow3DRender()
  const selectedObjectMapUrl = canUse3D
    ? configuredObjectMapUrl || (isDefaultMapSelected ? defaultObjectMapUrl : '')
    : ''
  const selectedObjectMapMetaUrl = canUse3D
    ? configuredObjectMapMetaUrl || (isDefaultMapSelected ? defaultObjectMapMetaUrl : '')
    : ''
  const hasObjectMap = canUse3D && Boolean(selectedObjectMapUrl && selectedObjectMapMetaUrl)
  debugLoad('initWorld:map-options', {
    canUse3D,
    hasObjectMap,
    isDefaultMapSelected,
    mapUrl: room.options.mapUrl,
    heightMapUrl: room.options.heightMapUrl ?? null,
    objectMapUrl: selectedObjectMapUrl,
    objectMapMetaUrl: selectedObjectMapMetaUrl,
  })

  initLoading([
    { key: 'resourcePack', labelKey: 'loadingStages.resourcePack' },
    { key: 'mapImage', labelKey: 'loadingStages.mapImage' },
    ...(canUse3D ? [{ key: 'heightMapImage', labelKey: 'loadingStages.heightMapImage' }] : []),
    ...(canUse3D ? [{ key: 'objectMapImage', labelKey: 'loadingStages.objectMapImage' }] : []),
    ...(canUse3D ? [{ key: 'objectMapMeta', labelKey: 'loadingStages.objectMapMeta' }] : []),
    { key: 'forestMap', labelKey: 'loadingStages.forestMap' },
    ...(canUse3D
      ? [{ key: 'heightMapProcessing', labelKey: 'loadingStages.heightMapProcessing' }]
      : []),
    { key: 'rendererInit', labelKey: 'loadingStages.rendererInit' },
  ])

  const selectedResourcePackUrl =
    (room.options?.[ROOM_SETTING_KEYS.RESOURCE_PACK_URL] as string | undefined) ||
    defaultResourcePackUrl
  try {
    setStageProgress('resourcePack', 10)
    await loadResourcePack(selectedResourcePackUrl)
    markStageDone('resourcePack')
  } catch (err) {
    emit('error', 'error.resourcepack_load_failed', selectedResourcePackUrl)
    throw err
  }
  preloadTextures()

  const map: mapmeta = {
    imageUrl: room.options.mapUrl,
    heightMapUrl: room.options.heightMapUrl ?? '',
    width: 0,
    height: 0,
    metersPerPixel: resolveRoomMetersPerPixel(room.options, null, defaultMetersPerPixel),
  }

  let loadMapProgress = 0
  let loadHeightMapProgress = 0

  let bitmap: ImageBitmap
  let bitmapHeightMap: ImageBitmap | null = null
  if (canUse3D && map.heightMapUrl) {
    const loaded = await Promise.all([
      loadImageWithProgress(map.imageUrl, (p) => {
        loadMapProgress = p
        setStageProgress('mapImage', loadMapProgress)
      }),
      loadImageWithProgress(map.heightMapUrl, (p) => {
        loadHeightMapProgress = p
        setStageProgress('heightMapImage', loadHeightMapProgress)
      }),
    ]).catch((err) => {
      const urls = map.heightMapUrl
        ? `${map.imageUrl}\n${map.heightMapUrl}`
        : map.imageUrl
      emit('error', 'error.map_load_failed', urls)
      throw err
    })
    bitmap = loaded[0]
    bitmapHeightMap = loaded[1]
    markStageDone('heightMapImage')
  } else {
    bitmap = await loadImageWithProgress(map.imageUrl, (p) => {
      loadMapProgress = p
      setStageProgress('mapImage', loadMapProgress)
    }).catch((err) => {
      emit('error', 'error.map_load_failed', map.imageUrl)
      throw err
    })
    if (canUse3D) {
      markStageDone('heightMapImage')
    }
  }
  markStageDone('mapImage')

  map.width = bitmap.width
  map.height = bitmap.height

  let objectMapBitmap: ImageBitmap | null = null
  let objectMapMeta: Record<string, unknown> | null = null
  if (hasObjectMap) {
    try {
      objectMapBitmap = await loadImageWithProgress(selectedObjectMapUrl, (p) => {
        setStageProgress('objectMapImage', p)
      })
    } catch (err) {
      const canUseDefaultObjectFallback =
        isDefaultMapSelected && normalizeAssetUrl(selectedObjectMapUrl) !== normalizeAssetUrl(defaultObjectMapUrl)
      if (!canUseDefaultObjectFallback) {
        emit('error', 'error.map_load_failed', selectedObjectMapUrl)
        throw err
      }
      objectMapBitmap = await loadImageWithProgress(defaultObjectMapUrl, (p) => {
        setStageProgress('objectMapImage', p)
      }).catch((fallbackErr) => {
        emit('error', 'error.map_load_failed', selectedObjectMapUrl)
        throw fallbackErr
      })
    }
    markStageDone('objectMapImage')

    objectMapMeta = await runStageWithPulse(
      'objectMapMeta',
      15,
      92,
      async () => {
        try {
          return await loadJsonWithFallback(selectedObjectMapMetaUrl)
        } catch (err) {
          const canUseDefaultObjectFallback =
            isDefaultMapSelected &&
            normalizeAssetUrl(selectedObjectMapMetaUrl) !== normalizeAssetUrl(defaultObjectMapMetaUrl)
          if (!canUseDefaultObjectFallback) {
            emit('error', 'error.map_load_failed', selectedObjectMapMetaUrl)
            throw err
          }
          return await loadJsonWithFallback(defaultObjectMapMetaUrl).catch((fallbackErr) => {
            emit('error', 'error.map_load_failed', selectedObjectMapMetaUrl)
            throw fallbackErr
          })
        }
      }
    )
    markStageDone('objectMapMeta')
  } else if (canUse3D) {
    markStageDone('objectMapImage')
    markStageDone('objectMapMeta')
  }

  map.metersPerPixel = resolveRoomMetersPerPixel(room.options, objectMapMeta, defaultMetersPerPixel)

  await nextTick()
  await new Promise(requestAnimationFrame)

  if (!canvas2dEl.value || (canUse3D && !canvas3dEl.value)) {
    emit('error', 'error.canvas_not_mounted')
    return null
  }
  if (!canvas2dOverlayEl.value || (canUse3D && !canvas3dOverlayEl.value)) {
    emit('error', 'error.canvas_overlay_not_mounted')
    return null
  }

  window.ROOM_WORLD = w = new world(map)
  w.id = room.uuid
  if (room.ingame_time) {
    w.time = room.ingame_time
  }
  if (room.stage) {
    w.stage = room.stage
  }
  if (room.weather) {
    w.weather.value = room.weather
    w.newWeather.value = room.weather
  }

  sceneAssets = {
    mapImage: bitmap,
    objectMapImage: objectMapBitmap,
    objectMapMeta,
    metersPerPixel: map.metersPerPixel || defaultMetersPerPixel,
  }

  resizeHandler = () => {
    if (!w || !renderer) return
    renderer.resize(window.innerWidth, window.innerHeight)
    w.setViewport(window.innerWidth, window.innerHeight)
    renderer.render(w)
    renderer.renderOverlay(w)
  }

  window.addEventListener('resize', resizeHandler)

  const forestMap = await runStageWithPulse(
    'forestMap',
    10,
    95,
    async () => await buildForestMap(bitmap, map.width, map.height)
  )
  w.setForestMap(forestMap)
  markStageDone('forestMap')

  if (bitmapHeightMap && canUse3D) {
    await runStageWithPulse(
      'heightMapProcessing',
      10,
      94,
      async () => await w!.setHeightMap(bitmapHeightMap)
    )
    markStageDone('heightMapProcessing')
  } else if (canUse3D) {
    markStageDone('heightMapProcessing')
  }

  await runStageWithPulse('rendererInit', 10, 96, async () => await mountActiveBackend())
  resizeHandler()
  markStageDone('rendererInit')

  startCameraStatePersistence(String(room.uuid), w)

  socket?.disconnect()
  socket = new GameSocket()
  socket.connect({
    roomId: String(room.uuid),
    team: props.team,
    userId: props.userId ?? null,
    key:
      localStorage.getItem(`room_admin_key_${room.uuid}`)
      ?? localStorage.getItem(`room_key_${room.uuid}`)
      ?? undefined,
    token: localStorage.getItem('token') ?? undefined,
    world: w,
  })

  const loop = () => {
    if (!w || !renderer) return
    renderer.render(w)
    renderer.renderOverlay(w)
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)

  ready.value = true
  emit('ready', w)
  emitLoading()
  debugLoad('initWorld:done', {
    roomId: String(room.uuid),
    elapsedMs: Math.round(performance.now() - initStartedAt),
  })
  return w
}

watch(
  () => props.room.uuid,
  async () => {
    await initWorld(props.room)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  cleanup()
})

watch(currentBackend, async (nextBackend, prevBackend) => {
  if (w && renderer && prevBackend) {
    captureCameraState(prevBackend, String(w.id || props.room.uuid), w)
    syncCameraBetweenBackends(prevBackend, nextBackend, String(w.id || props.room.uuid), w)
  }
  if (w && prevBackend && nextBackend !== prevBackend) {
    w.units.clearSelection()
    w.events.emit('changed', { reason: 'unit-selected' })
  }
  if (!ready.value) return
  await mountActiveBackend()
})

function toggleRendererBackend() {
  if (!allow3DRender()) {
    currentBackend.value = '2d'
    return
  }
  currentBackend.value = currentBackend.value === '2d' ? '3d' : '2d'
}
</script>

<template>
  <section class="room" :data-team="team">
    <button
      v-if="allow3DRender()"
      class="renderer-toggle"
      type="button"
      :disabled="isBackendMounting"
      @click="toggleRendererBackend"
    >
      {{ currentBackend.toUpperCase() }}
    </button>
    <canvas ref="canvas2dEl" class="map-canvas" :class="{ hidden: displayedBackend !== '2d' }" />
    <canvas
      ref="canvas2dOverlayEl"
      class="overlay-canvas"
      :class="{ hidden: displayedBackend !== '2d' }"
    />
    <canvas
      v-if="allow3DRender()"
      ref="canvas3dEl"
      class="map-canvas"
      :class="{ hidden: displayedBackend !== '3d' }"
    />
    <canvas
      v-if="allow3DRender()"
      ref="canvas3dOverlayEl"
      class="overlay-canvas"
      :class="{ hidden: displayedBackend !== '3d' }"
    />
    <transition name="backend-overlay-fade">
      <div v-if="showBackendSwitchOverlay" class="backend-switch-overlay">
        <div class="backend-switch-overlay__panel">
          <div class="backend-switch-overlay__spinner" />
          <div class="backend-switch-overlay__title">{{ t('loadingStages.switchTo3d') }}</div>
        </div>
      </div>
    </transition>
    <GameUi v-if="ready" :is3d-mode="currentBackend === '3d'" />
  </section>
</template>

<style scoped>
.room {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.room :is(.map-canvas, .overlay-canvas) {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh;
  display: block;
  touch-action: none;
  user-select: none;
}

.map-canvas {
  background: var(--panel);
}

.overlay-canvas {
  pointer-events: none;
}

.hidden {
  display: none !important;
}

.renderer-toggle {
  position: absolute;
  top: 0.85rem;
  right: 4.5rem;
  z-index: 4;
  min-width: 3.1rem;
  padding: 0.35rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--panel-border);
  background: rgba(15, 22, 33, 0.75);
  color: var(--text);
  font-size: 0.74rem;
  letter-spacing: 0.04em;
}

.renderer-toggle:disabled {
  opacity: 0.55;
  cursor: progress;
}

.backend-switch-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  background: rgba(10, 14, 21, 0.48);
  pointer-events: all;
}

.backend-switch-overlay__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  min-width: 200px;
  padding: 0.85rem 1.1rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(11, 18, 29, 0.78);
  backdrop-filter: blur(6px);
}

.backend-switch-overlay__spinner {
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.28);
  border-top-color: var(--accent);
  animation: backend-switch-spin 0.8s linear infinite;
}

.backend-switch-overlay__title {
  font-size: 0.8rem;
  color: var(--text);
  letter-spacing: 0.02em;
}

.backend-overlay-fade-enter-active,
.backend-overlay-fade-leave-active {
  transition: opacity 0.18s ease;
}

.backend-overlay-fade-enter-from,
.backend-overlay-fade-leave-to {
  opacity: 0;
}

@keyframes backend-switch-spin {
  to {
    transform: rotate(360deg);
  }
}

.map-canvas.dark {
  filter: invert(1) hue-rotate(180deg);
}
</style>


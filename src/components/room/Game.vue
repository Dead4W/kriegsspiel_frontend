<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import GameUi from '@/components/gameUI.vue'
import { Team } from '@/enums/teamKeys'
import { GameSocket } from '@/api/socket.ts'
import type { RoomData } from '@/structures/room'
import { ROOM_SETTING_KEYS } from '@/enums/roomSettingsKeys'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'

import {
  bindKeyboard,
  bindPointer,
  bindUnitInteraction,
  bindUnitContextCommands,
  canvasrenderer,
  loadImageWithProgress,
  type mapmeta,
  type uuid,
  world,
} from '@/engine'

import { buildForestMap } from '@/engine/assets/mapforest.ts'
import { preloadTextures } from '@/engine/assets/textures.ts'
import { loadResourcePack } from '@/engine/assets/resourcepack.ts'

const props = defineProps<{
  room: RoomData
  team: Team
  userId?: number | null
}>()

const emit = defineEmits<{
  (e: 'progress', value: number): void
  (e: 'ready', w: world): void
  (e: 'error', i18nKey: string, url?: string): void
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const canvasOverlayEl = ref<HTMLCanvasElement | null>(null)

let w: world | null = null
let renderer: canvasrenderer | null = null
let rafId: number | null = null
let resizeHandler: (() => void) | null = null
let socket: GameSocket | null = null
let cameraPersistTimer: number | null = null

const ready = ref(false)
const CAMERA_STATE_EPSILON = 0.0001

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isCameraClose(a: number, b: number) {
  return Math.abs(a - b) < CAMERA_STATE_EPSILON
}

function restoreSavedCameraState(currentRoomId: string, currentWorld: world) {
  const savedRoomId = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_ROOM_ID]
  if (savedRoomId !== currentRoomId) return

  const savedX = asFiniteNumber(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_X]
  )
  const savedY = asFiniteNumber(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_Y]
  )
  const savedZoom = asFiniteNumber(
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_ZOOM]
  )

  if (savedX == null || savedY == null || savedZoom == null) return

  currentWorld.camera.zoom = savedZoom
  currentWorld.camera.pos.x = savedX
  currentWorld.camera.pos.y = savedY
  currentWorld.camera.clampToWorld()
}

function startCameraStatePersistence(currentRoomId: string, currentWorld: world) {
  if (cameraPersistTimer != null) {
    clearInterval(cameraPersistTimer)
  }

  cameraPersistTimer = window.setInterval(() => {
    const cam = currentWorld.camera
    const savedRoomId = window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_ROOM_ID]
    const savedX = asFiniteNumber(
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_X]
    )
    const savedY = asFiniteNumber(
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_Y]
    )
    const savedZoom = asFiniteNumber(
      window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_ZOOM]
    )

    const hasSameRoom = savedRoomId === currentRoomId
    const hasSameCamera =
      savedX != null &&
      savedY != null &&
      savedZoom != null &&
      isCameraClose(savedX, cam.pos.x) &&
      isCameraClose(savedY, cam.pos.y) &&
      isCameraClose(savedZoom, cam.zoom)

    if (hasSameRoom && hasSameCamera) return

    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_ROOM_ID] = currentRoomId
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_X] = cam.pos.x
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_POS_Y] = cam.pos.y
    window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.LAST_CAMERA_ZOOM] = cam.zoom
  }, 1000)
}

function cleanup() {
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

  if (cameraPersistTimer != null) {
    clearInterval(cameraPersistTimer)
    cameraPersistTimer = null
  }

  renderer = null
  w = null
  ready.value = false
}

async function initWorld(room: RoomData) {
  cleanup()
  emit('progress', 0)

  let defaultMapUrl =
    'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg'
  let defaultHeightMapUrl =
    'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_height_map.png'
  let defaultMetersPerPixel = 5.38
  let defaultResourcePackUrl =
    `${location.origin}/assets/default_resourcepack.json`

  if (window.location.hostname === 'localhost') {
    room.options.mapUrl = ''
    defaultMapUrl = '/assets/default_map.jpeg'
    defaultHeightMapUrl = '/assets/default_height_map.png'
    defaultResourcePackUrl = '/assets/default_resourcepack.json'
    room.options[ROOM_SETTING_KEYS.RESOURCE_PACK_URL] = defaultResourcePackUrl
  }

  if (!room.options.mapUrl) {
    room.options.mapUrl = defaultMapUrl
    room.options.heightMapUrl = defaultHeightMapUrl
    room.options.metersPerPixel = defaultMetersPerPixel
  }

  const selectedResourcePackUrl =
    (room.options?.[ROOM_SETTING_KEYS.RESOURCE_PACK_URL] as string | undefined) ||
    defaultResourcePackUrl
  try {
    await loadResourcePack(selectedResourcePackUrl)
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
    metersPerPixel: room.options.metersPerPixel || 1,
  }

  let loadMapProgress = 0
  let loadHeightMapProgress = 0

  let bitmap: any
  let bitmapHeightMap: any
  if (map.heightMapUrl) {
    [bitmap, bitmapHeightMap] = await Promise.all([
      loadImageWithProgress(map.imageUrl, (p) => {
        loadMapProgress = p * 0.5
        emit('progress', loadMapProgress + loadHeightMapProgress)
      }),
      loadImageWithProgress(map.heightMapUrl, (p) => {
        loadHeightMapProgress = p * 0.5
        emit('progress', loadMapProgress + loadHeightMapProgress)
      }),
    ]).catch((err) => {
      const urls = map.heightMapUrl
        ? `${map.imageUrl}\n${map.heightMapUrl}`
        : map.imageUrl
      emit('error', 'error.map_load_failed', urls)
      throw err
    })
  } else {
    bitmap = await loadImageWithProgress(map.imageUrl, (p) => {
      loadMapProgress = p
      emit('progress', loadMapProgress)
    }).catch((err) => {
      emit('error', 'error.map_load_failed', map.imageUrl)
      throw err
    })
  }

  map.width = bitmap.width
  map.height = bitmap.height

  await nextTick()
  await new Promise(requestAnimationFrame)

  if (!canvasEl.value) {
    emit('error', 'error.canvas_not_mounted')
    return null
  }
  if (!canvasOverlayEl.value) {
    emit('error', 'error.canvas_overlay_not_mounted')
    return null
  }

  window.ROOM_WORLD = w = new world(map)
  w.id = room.uuid

  renderer = new canvasrenderer(canvasEl.value, canvasOverlayEl.value)

  resizeHandler = () => {
    if (!w || !renderer) return
    renderer.resize(window.innerWidth, window.innerHeight)
    w.setViewport(window.innerWidth, window.innerHeight)
    renderer.render(w)
    renderer.renderOverlay(w)
  }

  window.addEventListener('resize', resizeHandler)
  resizeHandler()
  restoreSavedCameraState(String(room.uuid), w)

  renderer.setMapImage(bitmap)
  w.setForestMap(await buildForestMap(bitmap, map.width, map.height))

  if (bitmapHeightMap) {
    await w.setHeightMap(bitmapHeightMap)
  }

  bindPointer(canvasEl.value, w)
  bindKeyboard(w)
  bindUnitInteraction(canvasEl.value, w)
  bindUnitContextCommands(w)
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
  emit('progress', 100)
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
</script>

<template>
  <section class="room" :data-team="team">
    <canvas ref="canvasEl" class="map-canvas" />
    <canvas ref="canvasOverlayEl" class="overlay-canvas" />
    <GameUi v-if="ready" />
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

.map-canvas.dark {
  filter: invert(1) hue-rotate(180deg);
}
</style>


<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import GameUi from '@/components/gameUI.vue'
import { Team } from '@/enums/teamKeys'
import { GameSocket } from '@/api/socket.ts'
import type { RoomData } from '@/structures/room'

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

const props = defineProps<{
  room: RoomData
  team: Team
}>()

const emit = defineEmits<{
  (e: 'progress', value: number): void
  (e: 'ready', w: world): void
  (e: 'error', i18nKey: string): void
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const canvasOverlayEl = ref<HTMLCanvasElement | null>(null)

let w: world | null = null
let renderer: canvasrenderer | null = null
let rafId: number | null = null
let resizeHandler: (() => void) | null = null
let socket: GameSocket | null = null

const ready = ref(false)

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

  renderer = null
  w = null
  ready.value = false
}

async function initWorld(room: RoomData) {
  cleanup()
  emit('progress', 0)

  preloadTextures()

  let defaultMapUrl =
    'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg'
  let defaultHeightMapUrl =
    'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_height_map.png'
  let defaultMetersPerPixel = 5.38

  if (window.location.hostname === 'localhost') {
    room.options.mapUrl = ''
    defaultMapUrl = '/assets/default_map.jpeg'
    defaultHeightMapUrl = '/assets/default_height_map.png'
  }

  if (!room.options.mapUrl) {
    room.options.mapUrl = defaultMapUrl
    room.options.heightMapUrl = defaultHeightMapUrl
    room.options.metersPerPixel = defaultMetersPerPixel
  }

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
    ;[bitmap, bitmapHeightMap] = await Promise.all([
      loadImageWithProgress(map.imageUrl, (p) => {
        loadMapProgress = p * 0.5
        emit('progress', loadMapProgress + loadHeightMapProgress)
      }),
      loadImageWithProgress(map.heightMapUrl, (p) => {
        loadHeightMapProgress = p * 0.5
        emit('progress', loadMapProgress + loadHeightMapProgress)
      }),
    ])
  } else {
    bitmap = await loadImageWithProgress(map.imageUrl, (p) => {
      loadMapProgress = p
      emit('progress', loadMapProgress)
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

  renderer.setMapImage(bitmap)
  w.setForestMap(await buildForestMap(bitmap, map.width, map.height))

  if (bitmapHeightMap) {
    await w.setHeightMap(bitmapHeightMap)
  }

  bindPointer(canvasEl.value, w)
  bindKeyboard(w)
  bindUnitInteraction(canvasEl.value, w)
  bindUnitContextCommands(w)

  socket?.disconnect()
  socket = new GameSocket()
  socket.connect({
    roomId: String(room.uuid),
    team: props.team,
    key:
      localStorage.getItem(`room_admin_key_${room.uuid}`)
      ?? localStorage.getItem(`room_key_${room.uuid}`)
      ?? undefined,
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


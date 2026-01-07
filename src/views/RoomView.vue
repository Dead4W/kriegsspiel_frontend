<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import api from '@/api/client'

import GameUi from '@/components/gameUI.vue'
import TeamSelect from '@/components/TeamSelect.vue'

import {
  bindKeyboard,
  bindPointer,
  bindUnitInteraction,
  canvasrenderer,
  loadImageWithProgress,
  type mapmeta,
  type uuid,
  world,
} from '@/engine'

import {ROOM_SETTING_KEYS} from '@/enums/roomSettingsKeys'
import {createClientSettings} from '@/enums/clientSettingsKeys'
import {Team} from '@/enums/teamKeys'
import {RoomStage} from '@/enums/roomStage'
import {buildForestMap} from "@/engine/assets/mapforest.ts";
import {preloadTextures} from "@/engine/assets/textures.ts";
import {GameSocket} from "@/api/socket.ts";

/* ================== state ================== */

const stage = ref<RoomStage>(RoomStage.LOADING)

let socket: GameSocket | null = null

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const canvasOverlayEl = ref<HTMLCanvasElement | null>(null)

const error = ref('')
const mapProgress = ref(0)
const roomData = ref<any>(null)

/* ================== engine refs ================== */

let w: world | null = null
let renderer: canvasrenderer | null = null
let unsubscribeRenderMain: (() => void) | null = null
let unsubscribeRenderOverlay: (() => void) | null = null

/* ================== helpers ================== */

function goHome() {
  router.push('/')
}

function applyRoomSettings(id: uuid, options?: Record<string, any>) {
  window.ROOM_SETTINGS ??= {}
  window.INPUT = {
    IGNORE_DRAG: false,
  }
  if (!options) return

  for (const key of Object.values(ROOM_SETTING_KEYS)) {
    if (key in options) {
      window.ROOM_SETTINGS[key] = options[key]
    }
  }
  window.ROOM_SETTINGS.uuid = id;
}

/* ================== room loading ================== */

async function loadRoom() {
  const uuid = route.params.uuid as string
  const password = localStorage.getItem(`room_pass_${uuid}`)

  try {
    const res = await api.get(`/room/${uuid}`, {
      headers: password ? { 'X-Room-Password': password } : undefined,
    })

    roomData.value = res.data
    applyRoomSettings(uuid, res.data.options)

    stage.value = RoomStage.TEAM_SELECT
  } catch (e: any) {
    if (e.response?.status === 403) {
      router.replace(`/room/${uuid}/password`)
    } else {
      error.value = 'error.room_not_found'
      stage.value = RoomStage.ERROR
    }
  }
}

/* ================== team select ================== */

async function onTeamSelected(team: Team) {
  window.CLIENT_SETTINGS = createClientSettings()
  window.PLAYER.team = team;

  stage.value = RoomStage.LOADING_MAP;

  preloadTextures();

  await nextTick()
  await initWorld(roomData.value)

  socket = new GameSocket()
  socket.connect({
    roomId: route.params.uuid as string,
    team: window.PLAYER.team,
    password: localStorage.getItem(`room_pass_${route.params.uuid}`) ?? undefined,
    world: w!,
  })
}

/* ================== world init ================== */

async function initWorld(room: any) {
  const map: mapmeta = {
    // imageUrl: room.options?.mapImage ?? '/assets/default_map.jpeg',
    imageUrl: room.options?.mapImage ?? 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg',
    heightMapUrl: room.options?.heightMapImage ?? '/assets/default_height_map.png',
    width: 9703,
    height: 7553,
    metersPerPixel: 5.38,
  }

  const bitmap = await loadImageWithProgress(
    map.imageUrl,
    (p) => (mapProgress.value = p)
  )

  await nextTick()
  await new Promise(requestAnimationFrame)

  if (!canvasEl.value) {
    error.value = 'error.canvas_not_mounted'
    stage.value = RoomStage.ERROR
    return
  }

  window.ROOM_WORLD = w = new world(map)

  if (!canvasOverlayEl.value) {
    error.value = 'error.canvas_overlay_not_mounted'
    stage.value = RoomStage.ERROR
    return
  }

  renderer = new canvasrenderer(
    canvasEl.value,
    canvasOverlayEl.value
  )

  const resize = () => {
    if (!w || !renderer) return
    renderer.resize(window.innerWidth, window.innerHeight)
    w.setViewport(window.innerWidth, window.innerHeight)
    renderer.render(w)
    renderer.renderOverlay(w)
  }

  window.addEventListener('resize', resize)
  resize()

  renderer.setMapImage(bitmap)
  w.setForestMap(await buildForestMap(
    bitmap,
    map.width,
    map.height
  ));

  // load height map
  const bitmapHeightMap = await loadImageWithProgress(
    map.heightMapUrl,
    (p) => (mapProgress.value = p)
  )
  await w.setHeightMap(bitmapHeightMap);

  bindPointer(canvasEl.value, w)
  bindKeyboard(w)
  bindUnitInteraction(canvasEl.value, w)

  function render() {
    renderer?.render(w!)
    renderer?.renderOverlay(w!)
    requestAnimationFrame(render);
  }
  render();

  stage.value = RoomStage.READY
}

/* ================== lifecycle ================== */

onMounted(loadRoom)

onBeforeUnmount(() => {
  socket?.disconnect()
})
</script>

<template>
  <!-- 1️⃣ loading room data -->
  <section v-if="stage === RoomStage.LOADING" class="state loading">
    <div>{{ t('loading') }}</div>
  </section>

  <!-- 2️⃣ loading map -->
  <section v-if="stage === RoomStage.LOADING_MAP" class="state loading">
    <div>{{ t('loading_map') }}</div>

    <div class="progress">
      <div class="bar" :style="{ width: mapProgress + '%' }"></div>
    </div>

    <div class="percent">{{ mapProgress }}%</div>
  </section>

  <!-- error -->
  <section v-if="stage === RoomStage.ERROR" class="state error">
    <h1>{{ t(error) }}</h1>
    <button class="home-btn" @click="goHome">
      {{ t('to_home') }}
    </button>
  </section>

  <!-- 2️⃣ team select -->
  <TeamSelect
    v-if="stage === RoomStage.TEAM_SELECT"
    @select="onTeamSelected"
  />

  <!-- 3️⃣ game -->
  <section v-show="stage == RoomStage.READY" class="room">
    <canvas ref="canvasEl" class="map-canvas" />
    <canvas ref="canvasOverlayEl" class="overlay-canvas"/>
    <GameUi v-if="stage == RoomStage.READY" />
  </section>
</template>

<style scoped>
.state {
  margin: auto;
  width: 100%;
  text-align: center;
}

.room {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

.map-canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  display: block;
  background: #020617;
  touch-action: none;
  user-select: none;
}

.overlay-canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  display: block;
  touch-action: none;
  user-select: none;
  pointer-events: none;
}

.map-canvas.dark {
  filter: invert(1) hue-rotate(180deg);
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
}

.error h1 {
  margin-bottom: 1.5rem;
}

.home-btn {
  padding: 0.7rem 2.2rem;
  border-radius: 10px;
  border: 1px solid var(--secondary);
  background: transparent;
  color: var(--text);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.progress {
  width: 280px;
  height: 8px;
  background: #1e293b;
  border-radius: 999px;
  overflow: hidden;
}

.bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.1s linear;
}

.percent {
  font-size: 0.8rem;
  color: #94a3b8;
}
</style>

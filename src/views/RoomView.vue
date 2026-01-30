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

import {ROOM_SETTING_KEYS, type RoomSettingKey} from '@/enums/roomSettingsKeys'
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

type RoomData = {
  uuid: uuid,
  team: Team,
  name: string,
  admin_id: number,
  options: Record<RoomSettingKey, any>,

  // ADMIN VALUES
  admin_key?: string,
  red_key?: string,
  blue_key?: string,
}

const error = ref('')
const mapProgress = ref(0)
const roomData = ref<RoomData | null>()

function getOrCreateClientId(roomId: string) {
  const key = `client_id_${roomId}`
  let id = localStorage.getItem(key)
  if (!id) {
    // Fallback for older browsers (shouldn't really happen).
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as Crypto).randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`
    localStorage.setItem(key, id)
  }
  return id
}

/* ================== engine refs ================== */

let w: world | null = null
let renderer: canvasrenderer | null = null

/* ================== helpers ================== */

function goHome() {
  router.push({
    name: 'home',
    params: {locale: route.params.locale}
  })
}

function applyRoomSettings(id: uuid, options?: Record<string, any>) {
  window.ROOM_SETTINGS ??= {}
  window.INPUT = {
    IGNORE_DRAG: false,
    IGNORE_UNIT_INTERACTION: false,
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

  // key из URL имеет приоритет
  const keyFromRoute = route.params.key as string | undefined
  const keyFromStorage = localStorage.getItem(`room_admin_key_${uuid}`)
    ?? localStorage.getItem(`room_key_${uuid}`)
  const key = keyFromRoute || keyFromStorage

  // если key пришёл из URL — сохраним
  if (keyFromRoute) {
    localStorage.setItem(`room_key_${uuid}`, keyFromRoute)
  }

  try {
    const res = await api.get(`/room/${uuid}`, {
      params: { key },
    })

    roomData.value = res.data!
    applyRoomSettings(uuid, res.data.options)

    if (roomData.value!.team === Team.ADMIN) {
      stage.value = RoomStage.TEAM_SELECT
      window.ROOM_KEYS = {
        admin_key: roomData.value!.admin_key!,
        blue_key: roomData.value!.blue_key!,
        red_key: roomData.value!.red_key!,
      }
    } else {
      if (keyFromRoute) {
        await router.push({
          name: 'room',
          params: {locale: route.params.locale, uuid: uuid}
        })
        return
      }
      stage.value = RoomStage.LOADING_MAP
      onTeamSelected(roomData.value!.team)
    }
  } catch (e: any) {
    if (e.response?.status === 403 || e.response?.status === 422) {
      error.value = 'error.wrong_key'
      stage.value = RoomStage.ERROR
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
  window.CLIENT_ID = getOrCreateClientId(route.params.uuid as string)

  stage.value = RoomStage.LOADING_MAP;

  preloadTextures();

  await nextTick()
  await initWorld(roomData.value!)

  if (w) {
    socket = new GameSocket()
    socket.connect({
      roomId: route.params.uuid as string,
      team: window.PLAYER.team,
      key: localStorage.getItem(`room_admin_key_${route.params.uuid}`)
        ?? localStorage.getItem(`room_key_${route.params.uuid}`)
        ?? undefined,
      world: w!,
    })
  }
}

/* ================== world init ================== */

async function initWorld(room: RoomData) {
  let defaultMapUrl = 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_map.jpeg';
  let defaultHeightMapUrl = 'https://dead4w.github.io/kriegsspiel_frontend/public/assets/default_height_map.png';
  let defaultMetersPerPixel = 5.38

  if (window.location.hostname === 'localhost') {
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

  let bitmap;
  let bitmapHeightMap;
  if (map.heightMapUrl) {
    [bitmap, bitmapHeightMap] = await Promise.all([
      loadImageWithProgress(
        map.imageUrl,
        (p) => {
          loadMapProgress = p * 0.5
          mapProgress.value = loadMapProgress + loadHeightMapProgress
        }
      ),
      loadImageWithProgress(
        map.heightMapUrl,
        (p) => {
          loadHeightMapProgress = p * 0.5
          mapProgress.value = loadMapProgress + loadHeightMapProgress
        }
      )
    ])
  } else {
    bitmap = await loadImageWithProgress(
      map.imageUrl,
      (p) => {
        loadMapProgress = p
        mapProgress.value = loadMapProgress
      }
    )
  }

  map.width = bitmap.width
  map.height = bitmap.height

  await nextTick()
  await new Promise(requestAnimationFrame)

  if (!canvasEl.value) {
    error.value = 'error.canvas_not_mounted'
    stage.value = RoomStage.ERROR
    return null
  }

  window.ROOM_WORLD = w = new world(map)
  w.id = room.uuid

  if (!canvasOverlayEl.value) {
    error.value = 'error.canvas_overlay_not_mounted'
    stage.value = RoomStage.ERROR
    return null
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
  if (bitmapHeightMap) {
    await w.setHeightMap(bitmapHeightMap);
  }

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
  return w
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

    <div class="percent">{{ Math.round(mapProgress) }}%</div>
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

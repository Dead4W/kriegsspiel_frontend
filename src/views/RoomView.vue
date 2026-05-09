<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import { loadRoom as apiLoadRoom } from '@/api/client'

import TeamSelect from '@/components/room/TeamSelect.vue'
import Game from '@/components/room/Game.vue'
import type { GameLoadingState } from '@/components/room/loading'
import { CLIENT_SETTING_KEYS } from '@/enums/clientSettingsKeys'

import type { uuid } from '@/engine'

import {ROOM_SETTING_KEYS} from '@/enums/roomSettingsKeys'
import {Team} from '@/enums/teamKeys'
import {RoomStage} from '@/enums/roomStage'
import type { RoomData } from '@/structures/room'

/* ================== state ================== */

const stage = ref<RoomStage>(RoomStage.LOADING)

const route = useRoute()
const router = useRouter()
const { t } = useI18n()


const error = ref('')
const errorParams = ref<Record<string, string>>({})
const loadingState = ref<GameLoadingState | null>(null)
const roomData = ref<RoomData | null>(null)
const selectedTeam = ref<Team | null>(null)
const selectedUserId = ref<number | null>(null)
const autoTeam = ref<Team | null>(null)
const isDarkTheme = ref(false)

function syncDarkTheme() {
  isDarkTheme.value = Boolean(window.CLIENT_SETTINGS?.[CLIENT_SETTING_KEYS.DARK_THEME])
}

syncDarkTheme()

const activeLoadingLabelKey = computed(() => {
  const state = loadingState.value
  if (!state?.activeStageKey) return 'loading_map'
  return (
    state.stages.find((stage) => stage.key === state.activeStageKey)?.labelKey ||
    'loading_map'
  )
})

const MAP_PREVIEW_CHUNK_COLS = 12
const MAP_PREVIEW_CHUNK_ROWS = 7
const MAP_PREVIEW_CHUNK_TOTAL = MAP_PREVIEW_CHUNK_COLS * MAP_PREVIEW_CHUNK_ROWS
const FOREST_PREVIEW_PIXEL_COLS = 96
const FOREST_PREVIEW_PIXEL_ROWS = 54
const FOREST_PREVIEW_PIXEL_TOTAL = FOREST_PREVIEW_PIXEL_COLS * FOREST_PREVIEW_PIXEL_ROWS

const mapPreviewUrl = computed(() => {
  const mapUrl = roomData.value?.options?.mapUrl
  if (typeof mapUrl !== 'string') return ''
  return mapUrl.trim()
})
const isMapPreviewVisible = ref(true)
const hasMapPreview = computed(() => Boolean(mapPreviewUrl.value) && isMapPreviewVisible.value)

const mapImageStageProgress = computed(() => {
  const state = loadingState.value
  if (!state) return 0
  const mapStage = state.stages.find((stage) => stage.key === 'mapImage')
  if (mapStage) {
    return Math.max(0, Math.min(100, mapStage.progress))
  }
  return Math.max(0, Math.min(100, state.totalProgress))
})

const totalLoadingProgress = computed(() =>
  Math.max(0, Math.min(100, loadingState.value?.totalProgress || 0))
)
function getStageProgress(stageKey: string) {
  const state = loadingState.value
  if (!state) return 0
  const stage = state.stages.find((item) => item.key === stageKey)
  if (!stage) return 0
  return Math.max(0, Math.min(100, stage.progress))
}
const forestMapStageProgress = computed(() => getStageProgress('forestMap'))
const isForestBuildStage = computed(() => loadingState.value?.activeStageKey === 'forestMap')

const revealedChunkCount = computed(() =>
  Math.round((mapImageStageProgress.value / 100) * MAP_PREVIEW_CHUNK_TOTAL)
)

const chunkTiles = computed(() => {
  const roomSeed = String(roomData.value?.uuid || route.params.uuid || '')
  const roomSeedOffset = Array.from(roomSeed).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  ) % MAP_PREVIEW_CHUNK_TOTAL

  return Array.from({ length: MAP_PREVIEW_CHUNK_TOTAL }, (_, index) => {
    const shiftedOrder = (index + roomSeedOffset) % MAP_PREVIEW_CHUNK_TOTAL
    return {
      id: index,
      revealed: shiftedOrder < revealedChunkCount.value,
    }
  })
})

const revealedForestPixelCount = computed(() =>
  Math.round((forestMapStageProgress.value / 100) * FOREST_PREVIEW_PIXEL_TOTAL)
)

const forestPixels = computed(() => {
  const roomSeed = String(roomData.value?.uuid || route.params.uuid || '')
  const roomSeedOffset = Array.from(roomSeed).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  ) % FOREST_PREVIEW_PIXEL_TOTAL

  return Array.from({ length: FOREST_PREVIEW_PIXEL_TOTAL }, (_, index) => {
    const shiftedOrder = (index + roomSeedOffset) % FOREST_PREVIEW_PIXEL_TOTAL
    return {
      id: index,
      revealed: shiftedOrder < revealedForestPixelCount.value,
    }
  })
})

watch(mapPreviewUrl, () => {
  isMapPreviewVisible.value = true
})

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
  const key = keyFromRoute || keyFromStorage || undefined

  // если key пришёл из URL — сохраним
  if (keyFromRoute) {
    localStorage.setItem(`room_key_${uuid}`, keyFromRoute)
    await router.replace({
      name: 'room',
      params: { locale: route.params.locale, uuid },
      query: route.query,
      hash: route.hash,
    })
  }

  try {
    const data = (await apiLoadRoom(uuid, key)) as RoomData
    roomData.value = data
    applyRoomSettings(uuid, data.options)

    if (roomData.value!.team === Team.ADMIN) {
      stage.value = RoomStage.TEAM_SELECT
      window.ROOM_KEYS = {
        admin_key: roomData.value!.admin_key!,
        blue_key: roomData.value!.blue_key!,
        red_key: roomData.value!.red_key!,
      }
    } else {
      stage.value = RoomStage.LOADING_MAP
      autoTeam.value = roomData.value!.team
    }
  } catch (e: any) {
    errorParams.value = {}
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

function onTeamSelected(payload: { team: Team; userId: number | null }) {
  stage.value = RoomStage.LOADING_MAP
  selectedTeam.value = payload.team
  selectedUserId.value = payload.userId
  autoTeam.value = null
  syncDarkTheme()
}

function onGameProgress(next: GameLoadingState) {
  loadingState.value = next
  syncDarkTheme()
}

function onGameError(i18nKey: string, url?: string) {
  error.value = i18nKey
  errorParams.value = url != null ? { url } : {}
  stage.value = RoomStage.ERROR
}

function onGameReady() {
  stage.value = RoomStage.READY
}

function onMapPreviewError() {
  isMapPreviewVisible.value = false
}

/* ================== lifecycle ================== */

onMounted(() => {
  syncDarkTheme()
  loadRoom()
})
</script>

<template>
  <!-- 1️⃣ loading room data -->
  <section v-if="stage === RoomStage.LOADING" class="state loading">
    <div>{{ t('loading') }}</div>
  </section>

  <!-- 2️⃣ loading map -->
  <section
    v-if="stage === RoomStage.LOADING_MAP"
    class="state loading loading-map"
  >
    <img
      v-if="hasMapPreview"
      class="loading-map-preview"
      :class="{ 'loading-map-preview--dark': isDarkTheme }"
      :src="mapPreviewUrl"
      alt=""
      draggable="false"
      @error="onMapPreviewError"
    />
    <div
      v-if="isForestBuildStage"
      class="loading-forest-mask"
      :class="{ 'loading-forest-mask--fallback': !hasMapPreview }"
      aria-hidden="true"
    >
      <div
        v-for="pixel in forestPixels"
        :key="pixel.id"
        class="loading-forest-mask__pixel"
        :class="{ 'loading-forest-mask__pixel--revealed': pixel.revealed }"
      />
    </div>
    <div
      v-else
      class="loading-map-mask"
      :class="{ 'loading-map-mask--fallback': !hasMapPreview }"
      aria-hidden="true"
    >
      <div
        v-for="tile in chunkTiles"
        :key="tile.id"
        class="loading-map-mask__tile"
        :class="{ 'loading-map-mask__tile--revealed': tile.revealed }"
      />
    </div>

    <div class="loading-panel">
      <div class="loading-title">{{ t('loadingStages.title') }}</div>
      <div class="loading-active">
        {{ t(activeLoadingLabelKey) }}
      </div>

      <div class="progress">
        <div class="bar" :style="{ width: totalLoadingProgress + '%' }"></div>
      </div>

      <div class="percent">{{ Math.round(totalLoadingProgress) }}%</div>
    </div>
  </section>

  <!-- error -->
  <section v-if="stage === RoomStage.ERROR" class="state error">
    <h1>{{ t(error, errorParams) }}</h1>
    <button class="home-btn" @click="goHome">
      {{ t('to_home') }}
    </button>
  </section>

  <!-- 2️⃣ team select -->
  <TeamSelect
    v-if="stage === RoomStage.TEAM_SELECT || (stage === RoomStage.LOADING_MAP && autoTeam != null)"
    :room-id="route.params.uuid as string"
    :room-maps="roomData?.room_maps"
    :auto-team="stage === RoomStage.LOADING_MAP ? autoTeam : null"
    @select="onTeamSelected"
  />

  <!-- 3️⃣ game -->
  <Game
    v-if="(stage === RoomStage.LOADING_MAP || stage === RoomStage.READY) && roomData && selectedTeam"
    v-show="stage === RoomStage.READY"
    :room="roomData"
    :team="selectedTeam"
    :user-id="selectedUserId"
    @progress="onGameProgress"
    @error="onGameError"
    @ready="onGameReady"
  />
</template>

<style scoped>
.state {
  margin: auto;
  width: 100%;
  text-align: center;
}

.loading {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}

.error h1 {
  margin-bottom: 1.5rem;
  white-space: pre-line;
}

.home-btn {
  padding: 0.7rem 2.2rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--secondary);
  background: transparent;
  color: var(--text);
}

.progress {
  width: 280px;
  height: 8px;
  background: var(--panel-border);
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
  color: var(--text-muted);
}

.loading-title {
  font-size: 1rem;
}

.loading-active {
  font-size: 0.82rem;
  color: var(--text-soft);
}

.loading-map {
  position: fixed;
  inset: 0;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(circle at 20% 20%, rgba(28, 45, 68, 0.55), transparent 45%),
    radial-gradient(circle at 80% 75%, rgba(33, 54, 79, 0.5), transparent 50%),
    #0a111b;
}

.loading-map-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.loading-map-preview--dark {
  filter: invert(1) hue-rotate(180deg);
}

.loading-map-mask {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: repeat(7, minmax(0, 1fr));
  pointer-events: none;
}

.loading-map-mask__tile {
  background: rgba(7, 11, 18, 0.88);
  transition: opacity 0.2s ease;
}

.loading-map-mask--fallback .loading-map-mask__tile {
  background: rgba(13, 24, 37, 0.66);
}

.loading-map-mask__tile--revealed {
  opacity: 0;
}

.loading-forest-mask {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(96, minmax(0, 1fr));
  grid-template-rows: repeat(54, minmax(0, 1fr));
  pointer-events: none;
  mix-blend-mode: screen;
}

.loading-forest-mask__pixel {
  background: rgba(8, 12, 18, 0.78);
  transition: opacity 0.08s linear;
}

.loading-forest-mask--fallback .loading-forest-mask__pixel {
  background: rgba(9, 30, 20, 0.7);
}

.loading-forest-mask__pixel--revealed {
  background: rgba(70, 178, 102, 0.62);
}

.loading-panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-md);
  background: rgba(7, 11, 18, 0.44);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(3px);
}
</style>

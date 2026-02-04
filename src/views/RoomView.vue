<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import { loadRoom as apiLoadRoom } from '@/api/client'

import TeamSelect from '@/components/room/TeamSelect.vue'
import Game from '@/components/room/Game.vue'

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
const mapProgress = ref(0)
const roomData = ref<RoomData | null>(null)
const selectedTeam = ref<Team | null>(null)
const autoTeam = ref<Team | null>(null)

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
      if (keyFromRoute) {
        await router.push({
          name: 'room',
          params: {locale: route.params.locale, uuid: uuid}
        })
        return
      }
      stage.value = RoomStage.LOADING_MAP
      autoTeam.value = roomData.value!.team
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

function onTeamSelected(team: Team) {
  stage.value = RoomStage.LOADING_MAP
  selectedTeam.value = team
  autoTeam.value = null
}

function onGameProgress(p: number) {
  mapProgress.value = p
}

function onGameError(i18nKey: string) {
  error.value = i18nKey
  stage.value = RoomStage.ERROR
}

function onGameReady() {
  stage.value = RoomStage.READY
}

/* ================== lifecycle ================== */

onMounted(loadRoom)
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
    v-if="stage === RoomStage.TEAM_SELECT || (stage === RoomStage.LOADING_MAP && autoTeam != null)"
    :room-id="route.params.uuid as string"
    :auto-team="stage === RoomStage.LOADING_MAP ? autoTeam : null"
    @select="onTeamSelected"
  />

  <!-- 3️⃣ game -->
  <Game
    v-if="(stage === RoomStage.LOADING_MAP || stage === RoomStage.READY) && roomData && selectedTeam"
    v-show="stage === RoomStage.READY"
    :room="roomData"
    :team="selectedTeam"
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
</style>

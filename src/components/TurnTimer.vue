<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {debugPerformance} from "@/engine/debugPerformance.ts";
import type {TimeOfDay} from "@/engine/resourcePack/timeOfDay.ts";
import {useI18n} from 'vue-i18n'
import {runTurnStep} from "@/engine/world/runTurnStep.ts";
import {
  isAdminOrSpectatorTeam,
  isAdminTeam,
  isPlanningStage,
  isRedOrBlueTeam,
  isTimeModifiersEnabled,
  isWarStage,
  isWeatherModifiersEnabled,
} from "@/game/roomGuards.ts";

const { t } = useI18n()

const displayWorldTime = ref<string>(window.ROOM_WORLD.time)
const timeOfDay = ref<TimeOfDay>(window.ROOM_WORLD.getTimeOfDay())
const weather = window.ROOM_WORLD.weather

const minutes = ref(1)
const seconds = ref(0)
const livePerMinute = ref(false)

const totalSeconds = ref(0)
const running = ref(false)
const isLiveRunning = ref(false)
const LIVE_TICK_MS = 1_000
let liveLoopToken = 0
let liveWaitTimeoutId: ReturnType<typeof window.setTimeout> | null = null

/* ===== helpers ===== */

const displayTurnTime = computed(() => {
  if (isLiveRunning.value) return 'LIVE'
  const m = Math.floor(totalSeconds.value / 60)
  const s = totalSeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

const isLiveDurationLocked = computed(() => running.value && isLiveRunning.value)

const showRemoteLiveBadge = computed(() => {
  return !isAdminTeam() && window.ROOM_WORLD.skipTimeLive.value
})

function onWheelNumber(
  e: WheelEvent,
  timeType: 'seconds' | 'minutes',
  min = -Infinity,
  max = Infinity
) {
  if (isLiveDurationLocked.value) return
  e.preventDefault()

  const delta = e.deltaY < 0 ? 1 : -1
  if (timeType === 'seconds') {
    seconds.value += delta
    seconds.value = Math.min(max, Math.max(min, seconds.value))
  } else if (timeType === 'minutes') {
    minutes.value += delta
    minutes.value = Math.min(max, Math.max(min, minutes.value))
  }
}

function clearLiveWaitTimer() {
  if (liveWaitTimeoutId != null) {
    window.clearTimeout(liveWaitTimeoutId)
    liveWaitTimeoutId = null
  }
}

function stopLiveTurn() {
  running.value = false
  isLiveRunning.value = false
  liveLoopToken += 1
  clearLiveWaitTimer()
  window.ROOM_WORLD.skipTime(0)
}

async function startTurn() {
  if (running.value) return

  const initialSeconds = minutes.value * 60 + seconds.value
  if (initialSeconds <= 0) return

  const runToken = ++liveLoopToken
  running.value = true
  isLiveRunning.value = livePerMinute.value
  totalSeconds.value = livePerMinute.value ? 0 : initialSeconds

  try {
    if (livePerMinute.value) {
      let liveFractionalCarry = 0
      const liveTicksPerMinute = Math.max(1, 60_000 / LIVE_TICK_MS)
      while (running.value && runToken === liveLoopToken) {
        const tickStartMs = Date.now()
        const perMinuteSeconds = Math.max(0, minutes.value * 60 + seconds.value)
        liveFractionalCarry += perMinuteSeconds / liveTicksPerMinute
        const skipSeconds = Math.floor(liveFractionalCarry)
        if (skipSeconds > 0 && running.value && runToken === liveLoopToken) {
          liveFractionalCarry -= skipSeconds
          await runTurnStep({
            worldInstance: window.ROOM_WORLD,
            secondsToSkip: skipSeconds,
            isLive: true,
            liveIntervalMs: LIVE_TICK_MS,
            liveGameSecondsPerMinute: perMinuteSeconds,
            shouldContinue: () => running.value && runToken === liveLoopToken,
          })
        }
        if (!running.value || runToken !== liveLoopToken) break

        const elapsedMs = Date.now() - tickStartMs
        const waitMs = Math.max(0, LIVE_TICK_MS - elapsedMs)
        if (waitMs > 0) {
          await new Promise<void>((resolve) => {
            liveWaitTimeoutId = window.setTimeout(() => {
              liveWaitTimeoutId = null
              resolve()
            }, waitMs)
          })
        }
      }
    } else {
      await runTurnStep({
        worldInstance: window.ROOM_WORLD,
        secondsToSkip: initialSeconds,
        isLive: false,
        shouldContinue: () => running.value && runToken === liveLoopToken,
        onStep: (leftSeconds) => {
          totalSeconds.value = leftSeconds
        },
      })
    }
  } finally {
    clearLiveWaitTimer()
    running.value = false
    isLiveRunning.value = false
    totalSeconds.value = 0
  }
}

function onPlayClick() {
  if (running.value) {
    if (isLiveRunning.value) {
      stopLiveTurn()
    }
    return
  }
  startTurn()
}

const readyStats = computed(() => window.ROOM_WORLD.getPlayerReadyStats())
const currentPlayerReady = computed(() => {
  if (!isRedOrBlueTeam()) return false
  const playerId = Number(window.PLAYER?.id)
  if (!Number.isFinite(playerId) || playerId <= 0) return false
  const team = window.PLAYER.team
  return window.ROOM_WORLD.playerReadyStates.value.some(
    (state) => state.user_id === playerId && state.team === team && state.is_ready
  )
})

function setReady(isReady: boolean) {
  if (!isPlanningStage() || !isRedOrBlueTeam()) return
  const playerId = Number(window.PLAYER?.id)
  if (!Number.isFinite(playerId) || playerId <= 0) return

  window.ROOM_WORLD.events.emit('api', {
    type: 'room_user_ready',
    data: {
      is_ready: isReady,
    },
  })
  window.ROOM_WORLD.upsertPlayerReadyState({
    user_id: playerId,
    team: window.PLAYER.team,
    is_ready: isReady,
  })
  window.ROOM_WORLD.events.emit('changed', { reason: 'room_user_ready' })
}

// LIFE CYCLE


// force refresh on changed
const refreshKey = ref(0)
function sync(data: {reason: string}) {
  debugPerformance('TurnTimer.sync', () => {
    if (['camera', 'drag', 'remoteMoveFrame'].includes(data.reason)) return;
    refreshKey.value++
    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()

    if (data.reason === 'skip_time_success' && !running.value) {
      running.value = false
      isLiveRunning.value = false
    }
  })
}

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
  sync({ reason: "init" })
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})
</script>

<template>
  <div class="turn-timer" :key="refreshKey">
    <div class="world-time">
      {{ displayWorldTime }}
      <span v-if="showRemoteLiveBadge" class="live-badge">LIVE</span>
    </div>

    <div class="turn-row">
      <div v-if="isPlanningStage() && isRedOrBlueTeam()" class="planning-ready-controls">
        <button
          class="ready-btn"
          :class="{ active: currentPlayerReady }"
          @pointerdown="setReady(!currentPlayerReady)"
        >
          {{ currentPlayerReady ? t('turn_timer.ready_disable') : t('turn_timer.ready_off') }}
        </button>
      </div>

      <div v-if="isPlanningStage() && isAdminOrSpectatorTeam()" class="planning-ready-stats">
        {{ t('turn_timer.ready_count', readyStats) }}
      </div>

      <div v-if="isAdminTeam() && isWarStage()" class="admin-controls">
        <div class="turn-time">
          ⏱ {{ displayTurnTime }}
        </div>

        <label class="live-toggle">
          <input type="checkbox" v-model="livePerMinute" :disabled="running" />
          LIVE per minute
        </label>

        <div class="admin-controls-row">
          <input
            type="number"
            min="0"
            v-model.number="minutes"
            :disabled="isLiveDurationLocked"
            @wheel="e => onWheelNumber(e, 'minutes', 0)"
          />
          <span>:</span>
          <input
            type="number"
            min="0"
            max="59"
            v-model.number="seconds"
            :disabled="isLiveDurationLocked"
            @wheel="e => onWheelNumber(e, 'seconds', 0)"
          />

          <button @pointerdown="onPlayClick" :disabled="running && !isLiveRunning">
            {{ running && isLiveRunning ? '⏸' : '▶' }}
          </button>
        </div>
      </div>
    </div>

    <div class="world-time-state">
      <span class="label" v-if="isTimeModifiersEnabled()">
        {{ t(`time.${timeOfDay}`) }}
      </span>
      <span class="separator" v-if="isTimeModifiersEnabled() && isWeatherModifiersEnabled()">
        •
      </span>
      <span class="label" v-if="isWeatherModifiersEnabled()">
        {{ t(`weather.${weather}`) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.turn-timer {
  width: 220px;
  text-align: center;

  background: #020617cc;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 6px 12px;

  color: white;
  font-size: 13px;

  display: flex;
  flex-direction: column;
  gap: 4px;

  pointer-events: auto;
}


.world-time {
  text-align: center;
  font-size: 20px;
  opacity: 0.85;
}

.live-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #dbeafe;
  background: #0f172a;
  border: 1px solid #38bdf8;
  vertical-align: middle;
}

.turn-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.planning-ready-controls {
  display: flex;
  justify-content: center;
}

.ready-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: white;
  cursor: pointer;
}

.ready-btn.active {
  background: #0f5132;
  border-color: #198754;
}

.planning-ready-stats {
  font-size: 13px;
  opacity: 0.95;
}

.turn-time {
  font-size: 16px;
  font-weight: 600;
  min-width: 56px;
}

.admin-controls {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  gap: 4px;
}

.live-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  font-size: 12px;
}

.live-toggle input {
  width: auto;
}

.admin-controls-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.admin-controls-row input {
  width: 50px;
  padding: 2px 4px;
  text-align: center;

  background: #020617;
  border: 1px solid #334155;
  color: white;
  border-radius: 6px;
}

.admin-controls-row button {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.admin-controls-row button:disabled {
  background: #020617;
  border-color: #334155;
  color: #64748b;

  cursor: not-allowed;
  opacity: 0.6;
}

button.disabled {
  background: #020617;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
  opacity: 0.6;
}

.world-time-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  font-size: 11px;
  opacity: 0.75;

  white-space: nowrap;
}

.world-time-state .icon {
  font-size: 14px;
}

.world-time-state .label {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-time-state .separator {
  opacity: 0.4;
  margin: 0 2px;
}

</style>

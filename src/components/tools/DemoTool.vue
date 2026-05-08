<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/api/client'
import type { unitstate, uuid } from '@/engine'
import type { PaintStroke } from '@/engine/types/paintTypes'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const route = useRoute()

/* ---------- state ---------- */

const snapshots = ref<string[]>([])
const index = ref(0)
const snapshotLoading = ref(false)
const listLoading = ref(false)
const error = ref<string | null>(null)
const isPlaying = ref(false)
const speedMinutesPerSecond = ref(1)
const currentPlaybackTime = ref<string | null>(null)

type SnapshotData = { units: Record<uuid, unitstate>; paint?: PaintStroke[] }
const snapshotCache = new Map<string, Promise<SnapshotData>>()
let playbackRaf: number | null = null
let playbackToken = 0
type ActiveTransition = {
  fromIndex: number
  toIndex: number
  progress: number
}
const activeTransition = ref<ActiveTransition | null>(null)

/* ---------- computed ---------- */

const snapshotLabel = computed(() =>
  t('tools.demo.snapshot_of', {
    current: index.value + 1,
    total: snapshots.value.length,
  })
)

function getSnapshotOptionLabel(raw: string, optionIndex: number) {
  if (optionIndex === index.value && currentPlaybackTime.value) {
    return currentPlaybackTime.value
  }
  return formatSnapshotTime(raw)
}

function formatSnapshotTime(raw: string) {
  return raw.replace('T', ' ').replace('.000000Z', '')
}

function parseSnapshotTimestamp(raw: string): number | null {
  let normalized = raw.trim()
  if (!normalized) return null
  normalized = normalized.replace(' ', 'T')

  normalized = normalized.replace(
    /\.(\d{3})\d+(Z)?$/,
    (_, ms: string, z: string | undefined) => `.${ms}${z ?? ''}`
  )

  const parsed = Date.parse(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function getSnapshotDeltaMinutes(fromTime: string, toTime: string): number {
  const from = parseSnapshotTimestamp(fromTime)
  const to = parseSnapshotTimestamp(toTime)
  if (from == null || to == null) return 0
  return Math.max(0, (to - from) / 60000)
}

function getTransitionDurationMs(fromTime: string, toTime: string): number {
  const deltaMinutes = getSnapshotDeltaMinutes(fromTime, toTime)
  const speed = Math.max(0.01, Number(speedMinutesPerSecond.value) || 0.01)
  if (deltaMinutes <= 0) return 100
  return Math.max(100, (deltaMinutes / speed) * 1000)
}

function cancelPlaybackRaf() {
  if (playbackRaf != null) {
    cancelAnimationFrame(playbackRaf)
    playbackRaf = null
  }
}

/* ---------- api ---------- */

async function loadSnapshotsList() {
  const uuid = route.params.uuid as string
  listLoading.value = true
  error.value = null

  try {
    const res = await api.get(`/room/${uuid}/snapshots`, {
      params: {
        key: window.ROOM_KEYS.admin_key ?? '',
      },
    })
    snapshots.value = res.data
    index.value = 0
    snapshotCache.clear()
  } catch (e) {
    console.error('Failed to load snapshots list', e)
    error.value = 'Failed to load snapshots'
  } finally {
    listLoading.value = false
  }
}

function fetchSnapshot(time: string): Promise<SnapshotData> {
  const cached = snapshotCache.get(time)
  if (cached) return cached

  const uuid = route.params.uuid as string
  const p = api
    .get(`/room/${uuid}/snapshots/${time}`, {
      params: { key: window.ROOM_KEYS.admin_key ?? '' },
    })
    .then((res) => res.data as SnapshotData)
    .catch((e) => {
      snapshotCache.delete(time)
      throw e
    })
  snapshotCache.set(time, p)
  return p
}

function preloadSnapshot(time: string) {
  if (snapshotCache.has(time)) return
  fetchSnapshot(time).catch((e) => console.warn('Preload failed:', e))
}

/** When at index N, preload N-1 and N+1 */
function preloadAdjacent() {
  const n = index.value
  const prevTime = snapshots.value[n - 1]
  const nextTime = snapshots.value[n + 1]
  if (prevTime) preloadSnapshot(prevTime)
  if (nextTime) preloadSnapshot(nextTime)
}

async function loadSnapshot() {
  if (!snapshots.value.length) return
  const time = snapshots.value[index.value]
  if (!time) return

  const cached = snapshotCache.get(time)
  if (cached) {
    try {
      const data = await cached
      applySnapshot(time, data)
      preloadAdjacent()
      return
    } catch {
      /* fall through to fetch */
    }
  }

  snapshotLoading.value = true
  error.value = null

  try {
    const data = await fetchSnapshot(time)
    applySnapshot(time, data)
    preloadAdjacent()
  } catch (e) {
    console.error('Failed to load snapshot', e)
    error.value = 'Failed to load snapshot'
  } finally {
    snapshotLoading.value = false
  }
}

async function loadSnapshotByIndex(newIndex: number) {
  stopPlayback()
  activeTransition.value = null
  if (snapshotLoading.value) return
  const clamped = Math.max(0, Math.min(newIndex, snapshots.value.length - 1))
  if (index.value !== clamped) {
    index.value = clamped
  }
  await loadSnapshot()
}

/* ---------- world ---------- */

function applySnapshot(
  time: string,
  data: { units: Record<uuid, unitstate>; paint?: PaintStroke[] }
) {
  const w = window.ROOM_WORLD
  const existingIds = new Set(w.units.list().map((u) => u.id))

  for (const unitId in data.units) {
    const unit = data.units[unitId] as unitstate
    w.units.upsert(unit, 'remote')
    existingIds.delete(unit.id)
  }
  for (const staleId of existingIds) {
    w.units.remove(staleId, 'remote')
  }

  w.clearPaint()
  if (Array.isArray(data.paint) && data.paint.length > 0) {
    for (const stroke of data.paint) {
      w.addPaintStroke(stroke, 'remote')
    }
  }

  w.time = time.replace('T', ' ').replace('.000000Z', '')
  currentPlaybackTime.value = w.time
  w.events.emit('changed', { reason: 'unit' })
}

async function interpolateToSnapshot(
  fromTime: string,
  fromData: SnapshotData,
  toTime: string,
  toData: SnapshotData,
  fromIndex: number,
  toIndex: number,
  initialProgress: number,
  token: number
) {
  const w = window.ROOM_WORLD
  const durationMs = getTransitionDurationMs(fromTime, toTime)
  const startMs = performance.now() - durationMs * Math.max(0, Math.min(1, initialProgress))

  const movingIds = new Set<uuid>()
  for (const id in fromData.units) {
    if (toData.units[id]) {
      movingIds.add(id as uuid)
    }
  }

  const fromTimestamp = parseSnapshotTimestamp(fromTime)
  const toTimestamp = parseSnapshotTimestamp(toTime)

  return await new Promise<boolean>((resolve) => {
    const tick = (now: number) => {
      if (!isPlaying.value || token !== playbackToken) {
        cancelPlaybackRaf()
        resolve(false)
        return
      }

      const elapsed = now - startMs
      const progress = Math.min(1, elapsed / durationMs)
      activeTransition.value = {
        fromIndex,
        toIndex,
        progress,
      }

      for (const id of movingIds) {
        const startUnit = fromData.units[id]
        const endUnit = toData.units[id]
        const liveUnit = w.units.get(id)
        if (!startUnit || !endUnit || !liveUnit) continue

        liveUnit.pos = {
          x: startUnit.pos.x + (endUnit.pos.x - startUnit.pos.x) * progress,
          y: startUnit.pos.y + (endUnit.pos.y - startUnit.pos.y) * progress,
        }
      }

      if (fromTimestamp != null && toTimestamp != null) {
        const currentTimestamp = fromTimestamp + (toTimestamp - fromTimestamp) * progress
        w.time = new Date(currentTimestamp).toISOString().slice(0, 19).replace('T', ' ')
        currentPlaybackTime.value = w.time
      }

      w.events.emit('changed', { reason: 'demo-interpolate' })

      if (progress >= 1) {
        cancelPlaybackRaf()
        activeTransition.value = null
        resolve(true)
        return
      }

      playbackRaf = requestAnimationFrame(tick)
    }

    playbackRaf = requestAnimationFrame(tick)
  })
}

async function playLoop(token: number) {
  while (isPlaying.value && token === playbackToken) {
    if (index.value >= snapshots.value.length - 1) {
      isPlaying.value = false
      break
    }

    const currentTime = snapshots.value[index.value]
    const nextTime = snapshots.value[index.value + 1]
    if (!currentTime || !nextTime) {
      isPlaying.value = false
      break
    }

    const resume =
      activeTransition.value
      && activeTransition.value.fromIndex === index.value
      && activeTransition.value.toIndex === index.value + 1
        ? activeTransition.value
        : null

    const nextNextTime = snapshots.value[index.value + 2]
    if (nextNextTime) preloadSnapshot(nextNextTime)

    const [currentData, nextData] = await Promise.all([
      fetchSnapshot(currentTime).catch(() => null),
      fetchSnapshot(nextTime).catch(() => null),
    ])
    if (!currentData || !nextData) {
      error.value = 'Failed to load snapshot'
      isPlaying.value = false
      break
    }

    if (!resume || resume.progress <= 0) {
      applySnapshot(currentTime, currentData)
    }

    const completed = await interpolateToSnapshot(
      currentTime,
      currentData,
      nextTime,
      nextData,
      index.value,
      index.value + 1,
      resume?.progress ?? 0,
      token
    )
    if (!completed || !isPlaying.value || token !== playbackToken) break

    index.value += 1
    applySnapshot(nextTime, nextData)
    preloadAdjacent()
  }
}

function play() {
  if (isPlaying.value || snapshotLoading.value) return
  if (!snapshots.value.length || index.value >= snapshots.value.length - 1) return
  error.value = null
  isPlaying.value = true
  playbackToken += 1
  void playLoop(playbackToken)
}

function pause() {
  if (!isPlaying.value) return
  isPlaying.value = false
  playbackToken += 1
  cancelPlaybackRaf()
}

function stopPlayback() {
  pause()
}

function onSpeedInput(value: string) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return
  speedMinutesPerSecond.value = Math.max(0.1, Math.min(600, numeric))
}

/* ---------- navigation ---------- */

function prev() {
  if (snapshotLoading.value) return
  if (index.value > 0) {
    void loadSnapshotByIndex(index.value - 1)
  }
}

function next() {
  if (snapshotLoading.value) return
  if (index.value < snapshots.value.length - 1) {
    void loadSnapshotByIndex(index.value + 1)
  }
}

function goToFirst() {
  if (snapshotLoading.value) return
  if (index.value !== 0) {
    void loadSnapshotByIndex(0)
  }
}

function goToLast() {
  if (snapshotLoading.value) return
  const last = snapshots.value.length - 1
  if (index.value !== last) {
    void loadSnapshotByIndex(last)
  }
}

function goToIndex(newIndex: number) {
  if (snapshotLoading.value) return
  void loadSnapshotByIndex(newIndex)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  } else if (e.key === 'Home') {
    e.preventDefault()
    goToFirst()
  } else if (e.key === 'End') {
    e.preventDefault()
    goToLast()
  }
}

/* ---------- lifecycle ---------- */

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await loadSnapshotsList()
  if (snapshots.value.length > 0) {
    await loadSnapshot()
  }
})

onUnmounted(() => {
  stopPlayback()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="demo-panel no-select">
    <button
      class="play-btn"
      :disabled="listLoading || snapshotLoading || !snapshots.length || index >= snapshots.length - 1"
      :title="isPlaying ? t('tools.demo.pause') : t('tools.demo.play')"
      @click="isPlaying ? pause() : play()"
    >
      {{ isPlaying ? '⏸' : '▶' }}
    </button>

    <button
      class="nav-btn"
      :title="t('tools.demo.first')"
      :disabled="index === 0 || snapshotLoading || isPlaying"
      @click="goToFirst"
    >
      ⏮
    </button>

    <button
      class="nav-btn"
      :title="t('tools.demo.prev')"
      :disabled="index === 0 || snapshotLoading || isPlaying"
      @click="prev"
    >
      ‹
    </button>

    <div class="demo-info">
      <template v-if="listLoading">
        <span class="demo-status">{{ t('tools.demo.loading') }}</span>
      </template>
      <template v-else-if="error">
        <span class="demo-error">{{ error }}</span>
      </template>
      <template v-else-if="!snapshots.length">
        <span class="demo-status">{{ t('tools.demo.empty') }}</span>
      </template>
      <template v-else>
        <select
          class="demo-select"
          :value="index"
          :disabled="snapshotLoading || isPlaying"
          :title="t('tools.demo.select_time')"
          @change="e => goToIndex(+(e.target as HTMLSelectElement).value)"
        >
          <option
            v-for="(snap, i) in snapshots"
            :key="snap"
            :value="i"
          >
            {{ getSnapshotOptionLabel(snap, i) }}
          </option>
        </select>
        <label class="demo-speed">
          <span>{{ t('tools.demo.speed') }}</span>
          <input
            type="number"
            min="0.1"
            max="600"
            step="0.1"
            :value="speedMinutesPerSecond"
            :disabled="snapshotLoading"
            @input="e => onSpeedInput((e.target as HTMLInputElement).value)"
          />
          <span>{{ t('tools.demo.speed_unit') }}</span>
        </label>
        <span class="demo-index">{{ snapshotLabel }}</span>
      </template>
    </div>

    <button
      class="nav-btn"
      :title="t('tools.demo.next')"
      :disabled="index === snapshots.length - 1 || snapshotLoading || isPlaying"
      @click="next"
    >
      ›
    </button>

    <button
      class="nav-btn"
      :title="t('tools.demo.last')"
      :disabled="index === snapshots.length - 1 || snapshotLoading || isPlaying"
      @click="goToLast"
    >
      ⏭
    </button>
  </div>
</template>

<style scoped>
.demo-panel {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);

  display: flex;
  align-items: center;
  gap: 10px;

  padding: 6px 12px;
  border-radius: 10px;

  color: white;
  background: #020617cc;
  border: 1px solid #334155;

  pointer-events: auto;
  z-index: 20;
}

.demo-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 200px;
}

.demo-select {
  padding: 4px 8px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  min-width: 180px;
}

.demo-select:disabled {
  opacity: 0.6;
  cursor: default;
}

.demo-select option {
  background: #0f172a;
  color: white;
}

.demo-index {
  font-size: 11px;
  opacity: 0.8;
}

.demo-speed {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.demo-speed input {
  width: 78px;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #0f172a;
  color: white;
}

.demo-status,
.demo-error {
  font-size: 13px;
}

.demo-error {
  color: #f87171;
}

.nav-btn {
  padding: 6px 12px;
  font-size: 18px;
  line-height: 1;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  background: #0f172a;
  border: 1px solid #334155;
  transition: background 0.15s, border-color 0.15s;
}

.play-btn {
  padding: 6px 12px;
  font-size: 18px;
  line-height: 1;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  background: #1d4ed8;
  border: 1px solid #3b82f6;
  transition: background 0.15s, border-color 0.15s;
}

.play-btn:hover:not(:disabled) {
  background: #2563eb;
  border-color: #60a5fa;
}

.play-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.nav-btn:hover:not(:disabled) {
  background: #1e293b;
  border-color: #475569;
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

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

type SnapshotData = { units: Record<uuid, unitstate>; paint?: PaintStroke[] }
const snapshotCache = new Map<string, Promise<SnapshotData>>()

/* ---------- computed ---------- */

const snapshotLabel = computed(() =>
  t('tools.demo.snapshot_of', {
    current: index.value + 1,
    total: snapshots.value.length,
  })
)

function formatSnapshotTime(raw: string) {
  return raw.replace('T', ' ').replace('.000000Z', '')
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

/* ---------- world ---------- */

function applySnapshot(
  time: string,
  data: { units: Record<uuid, unitstate>; paint?: PaintStroke[] }
) {
  const w = window.ROOM_WORLD

  w.clear()

  for (const unitId in data.units) {
    const unit = data.units[unitId] as unitstate
    w.units.upsert(unit, 'remote')
  }

  if (Array.isArray(data.paint) && data.paint.length > 0) {
    w.clearPaint()
    for (const stroke of data.paint) {
      w.addPaintStroke(stroke, 'remote')
    }
  }

  w.time = time.replace('T', ' ').replace('.000000Z', '')
  w.events.emit('changed', { reason: 'unit' })
}

/* ---------- navigation ---------- */

function prev() {
  if (snapshotLoading.value) return
  if (index.value > 0) {
    index.value--
    loadSnapshot()
  }
}

function next() {
  if (snapshotLoading.value) return
  if (index.value < snapshots.value.length - 1) {
    index.value++
    loadSnapshot()
  }
}

function goToFirst() {
  if (snapshotLoading.value) return
  if (index.value !== 0) {
    index.value = 0
    loadSnapshot()
  }
}

function goToLast() {
  if (snapshotLoading.value) return
  const last = snapshots.value.length - 1
  if (index.value !== last) {
    index.value = last
    loadSnapshot()
  }
}

function goToIndex(newIndex: number) {
  if (snapshotLoading.value) return
  const clamped = Math.max(0, Math.min(newIndex, snapshots.value.length - 1))
  if (index.value !== clamped) {
    index.value = clamped
    loadSnapshot()
  }
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
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="demo-panel no-select">
    <button
      class="nav-btn"
      :title="t('tools.demo.first')"
      :disabled="index === 0 || snapshotLoading"
      @click="goToFirst"
    >
      ⏮
    </button>

    <button
      class="nav-btn"
      :title="t('tools.demo.prev')"
      :disabled="index === 0 || snapshotLoading"
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
          :disabled="snapshotLoading"
          :title="t('tools.demo.select_time')"
          @change="e => goToIndex(+(e.target as HTMLSelectElement).value)"
        >
          <option
            v-for="(snap, i) in snapshots"
            :key="snap"
            :value="i"
          >
            {{ formatSnapshotTime(snap) }}
          </option>
        </select>
        <span class="demo-index">{{ snapshotLabel }}</span>
      </template>
    </div>

    <button
      class="nav-btn"
      :title="t('tools.demo.next')"
      :disabled="index === snapshots.length - 1 || snapshotLoading"
      @click="next"
    >
      ›
    </button>

    <button
      class="nav-btn"
      :title="t('tools.demo.last')"
      :disabled="index === snapshots.length - 1 || snapshotLoading"
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
  gap: 2px;
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

.nav-btn:hover:not(:disabled) {
  background: #1e293b;
  border-color: #475569;
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

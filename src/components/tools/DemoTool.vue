<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client'
import type {unitstate, uuid} from "@/engine";

const emit = defineEmits<{
  (e: 'close'): void
}>()

const route = useRoute()

/* ---------- state ---------- */

const snapshots = ref<string[]>([])
const index = ref(0)
const snapshotLoading = ref(false)

/* ---------- api ---------- */

async function loadSnapshotsList() {
  const uuid = route.params.uuid as string

  const res = await api.get(`/room/${uuid}/snapshots`, {
    params: {
      key: window.ROOM_KEYS.admin_key ?? '',
    },
  })

  snapshots.value = res.data
  index.value = 0
}

async function loadSnapshot() {
  if (!snapshots.value.length) return
  const w = window.ROOM_WORLD;

  snapshotLoading.value = true

  const uuid = route.params.uuid as string
  const time = snapshots.value[index.value]!

  w.updateTime('')
  const res = await api.get(`/room/${uuid}/snapshots/${time}`, {
    params: {
      key: window.ROOM_KEYS.admin_key ?? '',
    },
  })

  applySnapshot(time, res.data)

  snapshotLoading.value = false
}

/* ---------- world ---------- */

function applySnapshot(time: string, data: { units: Record<uuid, unitstate>; paint: any }) {
  const w = window.ROOM_WORLD;

  w.clear()

  for (const unitId in data.units) {
    const unit = data.units[unitId] as unitstate;
    w.units.upsert(unit, 'remote');
  }
  w.updateTime(time.replace('T', ' ').replace(".000000Z", ""))
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

/* ---------- lifecycle ---------- */

onMounted(async () => {
  window.ROOM_WORLD.socketLock = true
  await loadSnapshotsList()
  await loadSnapshot()
})
</script>

<template>
  <div class="demo-panel no-select">
    <button @click="prev" :disabled="index === 0 || snapshotLoading"><-</button>

    <div class="turnTimerPayloadSize"></div>

    <button @click="next" :disabled="index === snapshots.length - 1 || snapshotLoading">-></button>
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

  pointer-events: auto;
  z-index: 20;
}

.turnTimerPayloadSize {
  width: 220px;
}

.demo-panel button {
  padding: 4px 10px;
  font-size: 16px;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  background: #020617cc;
  border: 1px solid #334155;
}

.demo-panel button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

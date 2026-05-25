<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SpawnRect } from '@/game/planningSpawns'
import { getActiveZoneRects } from '@/game/planningSpawns'

type Point = { x: number; y: number }

const emit = defineEmits<{
  (e: 'capture-mode-change', hidden: boolean): void
}>()

const { t } = useI18n()

const isCapturing = ref(false)
const firstPoint = ref<Point | null>(null)
const localZones = ref<SpawnRect[]>([])

function syncLocalZones() {
  localZones.value = getActiveZoneRects()
}

function toRoundedPoint(point: Point): Point {
  return {
    x: Math.round(point.x * 100) / 100,
    y: Math.round(point.y * 100) / 100,
  }
}

function normalizeRect(from: Point, to: Point): SpawnRect {
  return {
    from: {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
    },
    to: {
      x: Math.max(from.x, to.x),
      y: Math.max(from.y, to.y),
    },
  }
}

function patchRoomParams(nextZones: SpawnRect[]) {
  window.ROOM_WORLD.events.emit('api', {
    type: 'room_params_update',
    data: {
      activeZones: nextZones,
    },
  })

  window.ROOM_PARAMS ??= {}
  window.ROOM_PARAMS.activeZones = nextZones
  window.ROOM_SETTINGS.activeZones = nextZones
  syncLocalZones()
}

function removeZone(index: number) {
  const zones = [...localZones.value]
  if (index < 0 || index >= zones.length) return
  zones.splice(index, 1)
  patchRoomParams(zones)
}

function getWorldPointFromPointer(e: PointerEvent): Point | null {
  const world = window.ROOM_WORLD.camera.screenToWorld({
    x: e.clientX,
    y: e.clientY,
  })
  if (!world) return null
  return toRoundedPoint(world)
}

function shouldIgnoreCaptureEvent(e: PointerEvent): boolean {
  const target = e.target as HTMLElement | null
  if (!target) return false
  return Boolean(target.closest('.krig-ui'))
}

function finishCapture() {
  isCapturing.value = false
  firstPoint.value = null
  emit('capture-mode-change', false)
}

function onCapturePointerDown(e: PointerEvent) {
  if (!isCapturing.value || e.button !== 0) return
  if (shouldIgnoreCaptureEvent(e)) return
  firstPoint.value = getWorldPointFromPointer(e)
}

function onCapturePointerUp(e: PointerEvent) {
  if (!isCapturing.value || e.button !== 0) return
  if (!firstPoint.value) return
  if (shouldIgnoreCaptureEvent(e)) return
  const secondPoint = getWorldPointFromPointer(e)
  if (!secondPoint) {
    finishCapture()
    return
  }
  const rect = normalizeRect(firstPoint.value, secondPoint)
  patchRoomParams([...localZones.value, rect])
  finishCapture()
}

function onCaptureKeydown(e: KeyboardEvent) {
  if (!isCapturing.value) return
  if (e.key !== 'Escape') return
  finishCapture()
}

function beginCapture() {
  if (isCapturing.value) return
  isCapturing.value = true
  firstPoint.value = null
  emit('capture-mode-change', true)
}

watch(
  () => window.ROOM_PARAMS?.activeZones,
  () => syncLocalZones(),
  { deep: true, immediate: true }
)

window.addEventListener('pointerdown', onCapturePointerDown)
window.addEventListener('pointerup', onCapturePointerUp)
window.addEventListener('keydown', onCaptureKeydown)

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onCapturePointerDown)
  window.removeEventListener('pointerup', onCapturePointerUp)
  window.removeEventListener('keydown', onCaptureKeydown)
  if (isCapturing.value) {
    emit('capture-mode-change', false)
  }
})
</script>

<template>
  <section class="active-zone-tab">
    <div class="settings-group">
      <h3>{{ t('tools.admin.settings_modal.active_zone.group_title') }}</h3>
      <p class="hint">{{ t('tools.admin.settings_modal.active_zone.group_hint') }}</p>

      <div class="zone-header">
        <button type="button" class="capture-btn" @click="beginCapture">
          {{ t('tools.admin.settings_modal.active_zone.add') }}
        </button>
      </div>

      <div v-if="localZones.length === 0" class="empty">
        {{ t('tools.admin.settings_modal.active_zone.empty') }}
      </div>

      <div v-else class="zones-list">
        <div
          v-for="(zone, index) in localZones"
          :key="`active-zone-${index}`"
          class="zone-row"
        >
          <span>
            #{{ index + 1 }}
            [{{ zone.from.x }}, {{ zone.from.y }}] → [{{ zone.to.x }}, {{ zone.to.y }}]
          </span>
          <button type="button" class="remove-btn" @click="removeZone(index)">
            {{ t('tools.admin.settings_modal.active_zone.remove') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.active-zone-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-group {
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-group h3 {
  margin: 0;
  font-size: 13px;
  color: #6ee7b7;
}

.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.zone-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.capture-btn,
.remove-btn {
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
}

.capture-btn:hover,
.remove-btn:hover {
  border-color: #10b981;
}

.remove-btn {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.45);
}

.empty {
  color: #94a3b8;
  font-size: 12px;
}

.zones-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.zone-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
}
</style>

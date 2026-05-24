<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Team } from '@/enums/teamKeys'
import type { SpawnRect } from '@/game/planningSpawns'
import { getTeamSpawnRects } from '@/game/planningSpawns'

type TeamKey = Team.RED | Team.BLUE
type Point = { x: number; y: number }

const emit = defineEmits<{
  (e: 'capture-mode-change', hidden: boolean): void
}>()

const { t } = useI18n()

const isCapturing = ref(false)
const captureTeam = ref<TeamKey | null>(null)
const firstPoint = ref<Point | null>(null)

const localSpawns = ref<Record<TeamKey, SpawnRect[]>>({
  [Team.RED]: [],
  [Team.BLUE]: [],
})

const teams = computed(() => [
  { key: Team.RED as TeamKey, label: t('team.red') },
  { key: Team.BLUE as TeamKey, label: t('team.blue') },
])

function syncLocalSpawns() {
  localSpawns.value = {
    [Team.RED]: getTeamSpawnRects(Team.RED),
    [Team.BLUE]: getTeamSpawnRects(Team.BLUE),
  }
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

function patchPerTeamSettings(team: TeamKey, nextSpawns: SpawnRect[]) {
  const payload = {
    [team]: {
      spawns: nextSpawns,
    },
  }

  window.ROOM_WORLD.events.emit('api', {
    type: 'room_per_team_settings_update',
    data: payload,
  })

  window.ROOM_SETTINGS.perTeamSettings = {
    ...(window.ROOM_SETTINGS.perTeamSettings || {}),
    [team]: {
      ...((window.ROOM_SETTINGS.perTeamSettings || {})[team] || {}),
      spawns: nextSpawns,
    },
  }
  window.ROOM_PARAMS ??= {}
  window.ROOM_PARAMS.perTeamSettings = {
    ...(window.ROOM_PARAMS.perTeamSettings || {}),
    [team]: {
      ...((window.ROOM_PARAMS.perTeamSettings || {})[team] || {}),
      spawns: nextSpawns,
    },
  }

  syncLocalSpawns()
}

function removeSpawn(team: TeamKey, index: number) {
  const zones = [...localSpawns.value[team]]
  if (index < 0 || index >= zones.length) return
  zones.splice(index, 1)
  patchPerTeamSettings(team, zones)
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
  captureTeam.value = null
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
  const team = captureTeam.value
  if (!team || !firstPoint.value) return
  if (shouldIgnoreCaptureEvent(e)) return
  const secondPoint = getWorldPointFromPointer(e)
  if (!secondPoint) {
    finishCapture()
    return
  }
  const rect = normalizeRect(firstPoint.value, secondPoint)
  patchPerTeamSettings(team, [...localSpawns.value[team], rect])
  finishCapture()
}

function onCaptureKeydown(e: KeyboardEvent) {
  if (!isCapturing.value) return
  if (e.key !== 'Escape') return
  finishCapture()
}

function beginCapture(team: TeamKey) {
  if (isCapturing.value) return
  isCapturing.value = true
  captureTeam.value = team
  firstPoint.value = null
  emit('capture-mode-change', true)
}

watch(
  () => window.ROOM_SETTINGS?.perTeamSettings,
  () => syncLocalSpawns(),
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
  <section class="spawn-tab">
    <div class="settings-group">
      <h3>{{ t('tools.admin.settings_modal.spawn.group_title') }}</h3>
      <p class="hint">{{ t('tools.admin.settings_modal.spawn.group_hint') }}</p>

      <div
        v-for="team in teams"
        :key="team.key"
        class="team-block"
      >
        <div class="team-header">
          <div class="team-title">{{ team.label }}</div>
          <button type="button" class="capture-btn" @click="beginCapture(team.key)">
            {{ t('tools.admin.settings_modal.spawn.add') }}
          </button>
        </div>

        <div v-if="localSpawns[team.key].length === 0" class="empty">
          {{ t('tools.admin.settings_modal.spawn.empty') }}
        </div>

        <div v-else class="spawns-list">
          <div
            v-for="(spawn, index) in localSpawns[team.key]"
            :key="`${team.key}-${index}`"
            class="spawn-row"
          >
            <span>
              #{{ index + 1 }}
              [{{ spawn.from.x }}, {{ spawn.from.y }}] → [{{ spawn.to.x }}, {{ spawn.to.y }}]
            </span>
            <button type="button" class="remove-btn" @click="removeSpawn(team.key, index)">
              {{ t('tools.admin.settings_modal.spawn.remove') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.spawn-tab {
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
  color: #93c5fd;
}

.hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.team-block {
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;
  background: rgba(2, 6, 23, 0.45);
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.team-title {
  font-weight: 600;
  font-size: 12px;
  color: #e2e8f0;
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
  border-color: #3b82f6;
}

.remove-btn {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.45);
}

.empty {
  color: #94a3b8;
  font-size: 12px;
}

.spawns-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spawn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Team } from '@/enums/teamKeys'

/**
 * What each side is trying to do, declared beside its briefing and its spawn
 * zones because that is what it is: a property of the scenario rather than of
 * whoever is commanding. It can be changed during the war stage, which is how
 * a side is retasked without stopping the game.
 */
type TeamKey = Team.RED | Team.BLUE
type Point = { x: number; y: number }
type MissionType = 'destroy' | 'defend' | 'capture'

type Mission = {
  type: MissionType
  point?: Point
  radiusMeters?: number
  byTime?: string
}

const MISSION_TYPES: MissionType[] = ['destroy', 'defend', 'capture']
const DEFAULT_RADIUS_METERS = 200

const emit = defineEmits<{
  (e: 'capture-mode-change', hidden: boolean): void
}>()

const { t } = useI18n()

const isPicking = ref(false)
const pickTeam = ref<TeamKey | null>(null)
const isSaved = ref(false)
let savedStateTimeout: ReturnType<typeof setTimeout> | undefined

const missions = ref<Record<TeamKey, Mission>>({
  [Team.RED]: { type: 'destroy' },
  [Team.BLUE]: { type: 'destroy' },
})

const teams = computed(() => [
  { key: Team.RED as TeamKey, label: t('team.red') },
  { key: Team.BLUE as TeamKey, label: t('team.blue') },
])

function perTeamSettings(): Record<string, Record<string, unknown>> {
  const source = (window.ROOM_SETTINGS as Record<string, unknown>)?.perTeamSettings
  if (!source || typeof source !== 'object') return {}
  return source as Record<string, Record<string, unknown>>
}

function readMission(team: TeamKey): Mission {
  const raw = perTeamSettings()[team]?.mission as Mission | undefined
  if (!raw || !MISSION_TYPES.includes(raw.type)) return { type: 'destroy' }
  return {
    type: raw.type,
    point: raw.point,
    radiusMeters: raw.radiusMeters ?? DEFAULT_RADIUS_METERS,
    byTime: raw.byTime ?? '',
  }
}

function syncFromRoomSettings() {
  missions.value = {
    [Team.RED]: readMission(Team.RED),
    [Team.BLUE]: readMission(Team.BLUE),
  }
}

/** A task that names a place is not saveable until it says where. */
function isIncomplete(mission: Mission): boolean {
  return mission.type !== 'destroy' && !mission.point
}

function save(team: TeamKey) {
  const mission = missions.value[team]
  if (isIncomplete(mission)) return

  const payload: Mission = { type: mission.type }
  if (mission.type !== 'destroy') {
    payload.point = mission.point
    payload.radiusMeters = Number(mission.radiusMeters) || DEFAULT_RADIUS_METERS
  }
  if (mission.byTime?.trim()) payload.byTime = mission.byTime.trim()

  window.ROOM_WORLD.events.emit('api', {
    type: 'room_per_team_settings_update',
    data: { [team]: { mission: payload } },
  })

  for (const store of [window.ROOM_SETTINGS, window.ROOM_PARAMS] as Array<
    Record<string, Record<string, Record<string, unknown>>>
  >) {
    if (!store) continue
    store.perTeamSettings = {
      ...(store.perTeamSettings || {}),
      [team]: { ...(store.perTeamSettings?.[team] || {}), mission: payload },
    }
  }

  isSaved.value = true
  if (savedStateTimeout) clearTimeout(savedStateTimeout)
  savedStateTimeout = setTimeout(() => {
    isSaved.value = false
  }, 2000)
}

function clear(team: TeamKey) {
  missions.value[team] = { type: 'destroy' }
  save(team)
}

function finishPicking() {
  isPicking.value = false
  pickTeam.value = null
  emit('capture-mode-change', false)
}

function onPickPointerUp(e: PointerEvent) {
  if (!isPicking.value || e.button !== 0) return
  const team = pickTeam.value
  if (!team) return
  if ((e.target as HTMLElement | null)?.closest('.krig-ui')) return

  const world = window.ROOM_WORLD.camera.screenToWorld({ x: e.clientX, y: e.clientY })
  if (world) {
    missions.value[team] = {
      ...missions.value[team],
      point: { x: Math.round(world.x * 100) / 100, y: Math.round(world.y * 100) / 100 },
    }
  }
  finishPicking()
}

function onPickKeydown(e: KeyboardEvent) {
  if (isPicking.value && e.key === 'Escape') finishPicking()
}

function beginPicking(team: TeamKey) {
  if (isPicking.value) return
  isPicking.value = true
  pickTeam.value = team
  emit('capture-mode-change', true)
}

watch(
  () => window.ROOM_SETTINGS?.perTeamSettings,
  () => syncFromRoomSettings(),
  { deep: true, immediate: true }
)

window.addEventListener('pointerup', onPickPointerUp)
window.addEventListener('keydown', onPickKeydown)

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onPickPointerUp)
  window.removeEventListener('keydown', onPickKeydown)
  if (isPicking.value) emit('capture-mode-change', false)
})
</script>

<template>
  <section class="mission-tab">
    <div class="settings-group">
      <h3>{{ t('tools.admin.settings_modal.mission.group_title') }}</h3>
      <p class="hint">{{ t('tools.admin.settings_modal.mission.group_hint') }}</p>

      <div
        v-for="team in teams"
        :key="team.key"
        class="team-block"
      >
        <div class="team-header">
          <div class="team-title">{{ team.label }}</div>
          <button type="button" class="clear-btn" @click="clear(team.key)">
            {{ t('tools.admin.settings_modal.mission.clear') }}
          </button>
        </div>

        <label class="field">
          <span class="field-label">{{ t('tools.admin.settings_modal.mission.type_label') }}</span>
          <select v-model="missions[team.key].type">
            <option v-for="type in MISSION_TYPES" :key="type" :value="type">
              {{ t(`tools.admin.settings_modal.mission.types.${type}`) }}
            </option>
          </select>
        </label>

        <template v-if="missions[team.key].type !== 'destroy'">
          <div class="field point-field">
            <span class="field-label">{{ t('tools.admin.settings_modal.mission.point_label') }}</span>
            <div class="point-row">
              <span v-if="missions[team.key].point" class="point-value">
                [{{ missions[team.key].point!.x }}, {{ missions[team.key].point!.y }}]
              </span>
              <span v-else class="empty">{{ t('tools.admin.settings_modal.mission.point_empty') }}</span>
              <button type="button" class="capture-btn" @click="beginPicking(team.key)">
                {{ t('tools.admin.settings_modal.mission.pick') }}
              </button>
            </div>
          </div>

          <label class="field">
            <span class="field-label">{{ t('tools.admin.settings_modal.mission.radius_label') }}</span>
            <input v-model.number="missions[team.key].radiusMeters" type="number" min="1" />
          </label>
        </template>

        <label class="field">
          <span class="field-label">{{ t('tools.admin.settings_modal.mission.by_time_label') }}</span>
          <input
            v-model="missions[team.key].byTime"
            type="text"
            :placeholder="t('tools.admin.settings_modal.mission.by_time_placeholder')"
          />
        </label>

        <button
          type="button"
          class="save-button"
          :class="{ saved: isSaved }"
          :disabled="isIncomplete(missions[team.key])"
          @click="save(team.key)"
        >
          {{
            isSaved
              ? t('tools.admin.settings_modal.mission.saved')
              : t('tools.admin.settings_modal.mission.save')
          }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mission-tab {
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
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.team-title {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.field select,
.field input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 7px 10px;
  color: #f8fafc;
  background: rgba(2, 6, 23, 0.78);
  font-family: inherit;
}

.field select:focus,
.field input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.point-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.point-value {
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
}

.empty {
  color: #94a3b8;
  font-size: 12px;
}

.capture-btn,
.clear-btn {
  border: 1px solid #475569;
  background: #0f172a;
  color: #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}

.capture-btn:hover,
.clear-btn:hover {
  border-color: #64748b;
  background: #1e293b;
}

.save-button {
  align-self: flex-start;
  border: 1px solid #2563eb;
  background: #1d4ed8;
  color: white;
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}

.save-button:hover:not(:disabled) {
  background: #1e40af;
}

.save-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-button.saved,
.save-button.saved:hover {
  border-color: #16a34a;
  background: #15803d;
}
</style>

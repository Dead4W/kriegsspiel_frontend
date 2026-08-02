<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Team } from '@/enums/teamKeys'
import { getSpawnUnitTypes } from '@/engine/resourcePack/units'

/**
 * How much of each kind of unit a side may raise during planning.
 *
 * This is the force allocation for the scenario, and it is the only thing
 * standing between a player and an army of whatever the pack's best unit
 * happens to be. Read by the board before a unit is placed, by the server
 * before it is stored, and by an automated player when it works out what to
 * field — so leaving a type blank is not a shrug, it grants an unlimited
 * number of them.
 */
type TeamKey = Team.RED | Team.BLUE

/** What a limit input holds: a count, or nothing at all for "no limit". */
type LimitDraft = Record<string, number | ''>

const emit = defineEmits<{
  (e: 'capture-mode-change', hidden: boolean): void
}>()

const { t } = useI18n()

const isSaved = ref(false)
let savedStateTimeout: ReturnType<typeof setTimeout> | undefined

const limits = ref<Record<TeamKey, LimitDraft>>({
  [Team.RED]: {},
  [Team.BLUE]: {},
})

const teams = computed(() => [
  { key: Team.RED as TeamKey, label: t('team.red') },
  { key: Team.BLUE as TeamKey, label: t('team.blue') },
])

const unitTypes = computed(() => getSpawnUnitTypes().map((type) => ({
  type: String(type),
  label: t(`unit.${type}`),
})))

function storedLimits(): Record<string, Record<string, unknown>> {
  for (const store of [window.ROOM_SETTINGS, window.ROOM_PARAMS] as Array<
    Record<string, unknown> | undefined
  >) {
    const source = store?.teamUnitLimits
    if (source && typeof source === 'object') {
      return source as Record<string, Record<string, unknown>>
    }
  }
  return {}
}

function readTeam(team: TeamKey): LimitDraft {
  const stored = storedLimits()[team]
  const draft: LimitDraft = {}
  if (!stored || typeof stored !== 'object') return draft

  for (const [type, value] of Object.entries(stored)) {
    // The server normalises anything unusable to null, which is a type nobody
    // may raise — zero says that in a number field.
    draft[type] = value === null ? 0 : Math.max(0, Math.floor(Number(value) || 0))
  }
  return draft
}

function syncFromRoomSettings() {
  limits.value = {
    [Team.RED]: readTeam(Team.RED),
    [Team.BLUE]: readTeam(Team.BLUE),
  }
}

/** The blanks are dropped rather than sent as zero: they mean "unlimited". */
function payloadFor(draft: LimitDraft): Record<string, number> {
  const payload: Record<string, number> = {}
  for (const [type, value] of Object.entries(draft)) {
    if (value === '' || value === null || value === undefined) continue
    payload[type] = Math.max(0, Math.floor(Number(value) || 0))
  }
  return payload
}

function save() {
  const payload = {
    [Team.RED]: payloadFor(limits.value[Team.RED]),
    [Team.BLUE]: payloadFor(limits.value[Team.BLUE]),
  }

  window.ROOM_WORLD.events.emit('api', {
    type: 'room_options_update',
    data: { teamUnitLimits: payload },
  })

  for (const store of [window.ROOM_SETTINGS, window.ROOM_PARAMS] as Array<
    Record<string, unknown> | undefined
  >) {
    if (!store) continue
    store.teamUnitLimits = payload
  }

  isSaved.value = true
  if (savedStateTimeout) clearTimeout(savedStateTimeout)
  savedStateTimeout = setTimeout(() => {
    isSaved.value = false
  }, 2000)
}

function clearTeam(team: TeamKey) {
  limits.value[team] = {}
}

/** Gives both sides the same allowance, which is how most scenarios start. */
function mirrorToOtherTeam(from: TeamKey) {
  const other = from === Team.RED ? Team.BLUE : Team.RED
  limits.value[other] = { ...limits.value[from] }
}

function usedBy(team: TeamKey, type: string): number {
  return window.ROOM_WORLD.units.list()
    .filter((unit) => unit.team === team && unit.type === type)
    .length
}

/** A limit already broken by what is on the board is worth flagging. */
function isOverspent(team: TeamKey, type: string): boolean {
  const limit = limits.value[team][type]
  if (limit === '' || limit === undefined) return false
  return usedBy(team, type) > Number(limit)
}

watch(
  () => [window.ROOM_SETTINGS?.teamUnitLimits, window.ROOM_PARAMS?.teamUnitLimits],
  () => syncFromRoomSettings(),
  { deep: true, immediate: true }
)

onBeforeUnmount(() => {
  if (savedStateTimeout) clearTimeout(savedStateTimeout)
  emit('capture-mode-change', false)
})
</script>

<template>
  <section class="unit-limits-tab">
    <div class="settings-group">
      <h3>{{ t('tools.admin.settings_modal.unit_limits.group_title') }}</h3>
      <p class="hint">{{ t('tools.admin.settings_modal.unit_limits.group_hint') }}</p>

      <table class="limits-table">
        <thead>
          <tr>
            <th class="type-column">{{ t('tools.admin.settings_modal.unit_limits.type_column') }}</th>
            <th v-for="team in teams" :key="team.key">{{ team.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="unit in unitTypes" :key="unit.type">
            <td class="type-column">{{ unit.label }}</td>
            <td v-for="team in teams" :key="team.key">
              <div class="limit-cell">
                <input
                  v-model.number="limits[team.key][unit.type]"
                  type="number"
                  min="0"
                  :class="{ overspent: isOverspent(team.key, unit.type) }"
                  :placeholder="t('tools.admin.settings_modal.unit_limits.unlimited')"
                />
                <span class="used">{{ usedBy(team.key, unit.type) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="actions">
        <button type="button" class="secondary-btn" @click="mirrorToOtherTeam(Team.RED)">
          {{ t('tools.admin.settings_modal.unit_limits.mirror_red') }}
        </button>
        <button type="button" class="secondary-btn" @click="mirrorToOtherTeam(Team.BLUE)">
          {{ t('tools.admin.settings_modal.unit_limits.mirror_blue') }}
        </button>
        <button type="button" class="secondary-btn" @click="clearTeam(Team.RED); clearTeam(Team.BLUE)">
          {{ t('tools.admin.settings_modal.unit_limits.clear') }}
        </button>
      </div>

      <button
        type="button"
        class="save-button"
        :class="{ saved: isSaved }"
        @click="save"
      >
        {{
          isSaved
            ? t('tools.admin.settings_modal.unit_limits.saved')
            : t('tools.admin.settings_modal.unit_limits.save')
        }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.unit-limits-tab {
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

.limits-table {
  width: 100%;
  border-collapse: collapse;
}

.limits-table th,
.limits-table td {
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid rgba(51, 65, 85, 0.6);
}

.limits-table th {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.type-column {
  color: #e2e8f0;
  font-size: 12px;
  white-space: nowrap;
}

.limit-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.limit-cell input {
  box-sizing: border-box;
  width: 90px;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;
  color: #f8fafc;
  background: rgba(2, 6, 23, 0.78);
  font-family: inherit;
}

.limit-cell input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.limit-cell input.overspent {
  border-color: #dc2626;
}

.used {
  color: #94a3b8;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.secondary-btn {
  border: 1px solid #475569;
  background: #0f172a;
  color: #cbd5e1;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}

.secondary-btn:hover {
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

.save-button:hover {
  background: #1e40af;
}

.save-button.saved,
.save-button.saved:hover {
  border-color: #16a34a;
  background: #15803d;
}
</style>

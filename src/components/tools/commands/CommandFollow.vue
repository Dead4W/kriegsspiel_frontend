<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'
import type { unsub } from '@/engine/events'
import { FollowCommand } from '@/engine/units/commands/followCommand'
import { MoveCommand, type MoveCommandState } from '@/engine/units/commands/moveCommand'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes'
import { groupUnitsByTypeAndTeam } from '@/game/commands/shared/groupUnitsByTypeAndTeam'
import HotkeyTag from '@/components/ui/HotkeyTag.vue'

const { t } = useI18n()

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const followers = ref<BaseUnit[]>([])
const targets = ref<BaseUnit[]>([])
const distanceMeters = ref(50)
const followersGrouped = computed(() => groupUnitsByTypeAndTeam(followers.value))
const targetsGrouped = computed(() => groupUnitsByTypeAndTeam(targets.value))

function syncTargets() {
  const followerIds = new Set(followers.value.map((unit) => unit.id))
  targets.value = window.ROOM_WORLD.units
    .list()
    .filter((unit) => unit.selected && unit.alive && !followerIds.has(unit.id))
}

function confirm() {
  if (!followers.value.length || !targets.value.length) return

  const targetIds = targets.value.map((target) => target.id)
  const normalizedDistance = Math.max(0, Number(distanceMeters.value) || 0)
  for (const follower of followers.value) {
    const commands = follower.getCommands().filter((command) => {
      if (command.type === UnitCommandTypes.Follow) return false
      if (command.type !== UnitCommandTypes.Move) return true
      const moveState = command.getState().state as MoveCommandState
      return !FollowCommand.isFollowMoveComment(moveState.comment)
    })
    follower.setCommands([
      ...commands,
      new FollowCommand({
        targets: targetIds,
        distanceMeters: normalizedDistance,
      }),
    ])
    follower.setDirty()
  }

  cleanup()
  emit('close')
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
}

let unsubscribe: unsub | undefined

function cleanup() {
  followers.value = []
  targets.value = []
  unsubscribe?.()
  unsubscribe = undefined
}

onMounted(() => {
  followers.value = [...props.units]
  syncTargets()
  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason === 'select') syncTargets()
  })
})

onUnmounted(cleanup)

defineExpose({ confirm })
</script>

<template>
  <div class="order-follow">
    <div class="column">
      <div class="title">{{ t('tools.command.from') }}</div>
      <div class="cards">
        <div v-for="unit in followersGrouped" :key="unit.type + unit.team" class="card">
          {{ t(`unit.${unit.type}`) }} × {{ unit.count }}
        </div>
      </div>
    </div>

    <div class="arrow">➜</div>

    <div class="column">
      <div class="title">{{ t('tools.command.targets') }}</div>
      <div v-if="!targetsGrouped.length" class="hint">{{ t('tools.command.follow_hint') }}</div>
      <div class="cards">
        <div v-for="unit in targetsGrouped" :key="unit.type + unit.team" class="card">
          {{ t(`unit.${unit.type}`) }} × {{ unit.count }}
        </div>
      </div>
    </div>

    <label class="column distance">
      <span class="title">{{ t('tools.command.follow_distance') }}</span>
      <input v-model.number="distanceMeters" type="number" min="0" step="10">
    </label>

    <div class="column actions">
      <button class="btn confirm" :disabled="!targets.length" @click="confirm" :title="`${t('hotkey')}: E`">
        {{ t('tools.command.apply') }}
        <HotkeyTag key-label="E" />
      </button>
      <button class="btn cancel" @click="emit('close')" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
        <HotkeyTag key-label="Q" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.order-follow {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 12px;
  background: #020617ee;
  border-top: 1px solid #334155;
  font-size: 11px;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.column.distance {
  min-width: 100px;
}

.column.actions {
  justify-content: flex-end;
}

.title {
  color: #94a3b8;
  font-size: 10px;
}

.hint {
  font-size: 10px;
  color: #64748b;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card {
  padding: 4px 6px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: var(--panel);
  white-space: nowrap;
}

.arrow {
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 14px;
}

input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #020617;
  color: #e5e7eb;
}

.btn {
  position: relative;
  padding: 4px 8px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #020617;
  font-size: 11px;
  cursor: pointer;
}

.btn.confirm {
  color: #38bdf8;
}

.btn.cancel {
  color: #94a3b8;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

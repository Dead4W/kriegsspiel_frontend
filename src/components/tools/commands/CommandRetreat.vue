<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { RetreatCommand } from '@/engine/units/commands/retreatCommand.ts'

const { t } = useI18n()

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/* ===== SNAPSHOT ===== */

const unitsSnapshot = ref<BaseUnit[]>([])

/* ===== STATE ===== */

const hours = ref(24)
const minutes = ref(0)

const retreatTimeSeconds = computed(() => {
  return hours.value * 60 * 60 + minutes.value * 60
})

const retreatTimeMinutes = computed(() => {
  return hours.value * 60 + minutes.value
})

/* ===== ACTION ===== */

function apply() {
  const cmd = new RetreatCommand({
    elapsed: 0,
    duration: retreatTimeSeconds.value > 0 ? retreatTimeSeconds.value : Infinity,
  })

  for (const u of unitsSnapshot.value) {
    u.addCommand(cmd.getState(), true)
    u.setDirty()
  }

  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
  emit('close')
}

function confirm() {
  apply()
}

onMounted(() => {
  unitsSnapshot.value = [...props.units]
})

defineExpose({
  confirm,
})
</script>

<template>
  <div class="order-retreat">
    <div class="column settings">
      <div class="title">
        {{ t('tools.command.retreat') }}
      </div>
      <div class="hint">
        {{ t('tools.command.retreat_hint') }}
      </div>

      <div class="time-inputs">
        <label>
          {{ t('time.hours') }}
          <input
            type="number"
            min="0"
            step="1"
            v-model.number="hours"
            @keydown.stop
          />
        </label>

        <span class="time-separator">:</span>

        <label>
          {{ t('time.minute') }}
          <input
            type="number"
            min="0"
            max="59"
            step="1"
            v-model.number="minutes"
            @keydown.stop
          />
        </label>
      </div>

      <div class="hint" v-if="retreatTimeSeconds > 0">
        {{ t('tools.command.total_minutes') }}: {{ retreatTimeMinutes.toFixed(0) }}
      </div>
      <div class="hint" v-if="retreatTimeSeconds === 0">
        {{ t('tools.command.total_minutes') }}: {{ t('time.infinity') }}
      </div>
    </div>

    <div class="column actions">
      <button class="btn confirm" @click="confirm">
        {{ t('tools.command.retreat_confirm') }}
      </button>
      <button class="btn cancel" @click="emit('close')">
        {{ t('tools.command.cancel') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.order-retreat {
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

.column.settings {
  min-width: 220px;
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
  white-space: pre-line;
}

.time-inputs {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.time-inputs label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: #94a3b8;
}

.time-separator {
  color: #94a3b8;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px 4px;
}

.time-inputs input {
  width: 56px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #e5e7eb;
  font-size: 11px;
}

.btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  cursor: pointer;
}

.btn.confirm {
  color: #fbbf24;
}

.btn.resume {
  color: #22c55e;
}

.btn.cancel {
  color: #94a3b8;
}
</style>


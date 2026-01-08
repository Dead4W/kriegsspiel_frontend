<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { WaitCommand } from '@/engine/units/commands/waitCommand.ts'

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

const minutes = ref(0)
const seconds = ref(1)
const comment = ref('')

const waitTime = computed(() => {
  return minutes.value * 60 + seconds.value
})

/* ===== ACTION ===== */

function confirm() {
  if (waitTime.value <= 0) return

  const cmd = new WaitCommand({
    wait: waitTime.value,
    elapsed: 0,
    comment: comment.value || undefined,
  })

  for (const u of unitsSnapshot.value) {
    u.addCommand(cmd.getState())
    u.setDirty()
  }

  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
  emit('close')
}

/* ===== LIFE CYCLE ===== */

onMounted(() => {
  unitsSnapshot.value = [...props.units]
})
</script>

<template>
  <div class="order-wait">

    <!-- ===== SETTINGS ===== -->
    <div class="column settings">
      <div class="title">
        {{ t('tools.command.wait') }}
      </div>

      <div class="time-inputs">
        <label>
          {{ t('time.minute') }}
          <input
            type="number"
            min="0"
            step="1"
            v-model.number="minutes"
          />
        </label>

        <label>
          {{ t('time.second') }}
          <input
            type="number"
            min="0"
            max="59"
            step="1"
            v-model.number="seconds"
          />
        </label>
      </div>

      <div class="hint">
        {{ t('tools.command.total_seconds') }}: {{ waitTime.toFixed(1) }} c
      </div>

      <input
        class="comment"
        type="text"
        :placeholder="t('tools.command.comment')"
        v-model="comment"
      />
    </div>

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button class="btn cancel" @click="emit('close')">
        {{ t('tools.command.cancel') }}
      </button>

      <button
        class="btn confirm"
        :disabled="waitTime <= 0"
        @click="confirm"
      >
        {{ t('tools.command.wait') }}
      </button>
    </div>

  </div>
</template>

<style scoped>
.order-wait {
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
  min-width: 180px;
}

.column.actions {
  justify-content: flex-end;
}

.title {
  color: #94a3b8;
  font-size: 10px;
}

.comment {
  margin-top: 4px;
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
  color: #22c55e;
}

.btn.cancel {
  color: #94a3b8;
}

.time-inputs {
  display: flex;
  gap: 6px;
}

.time-inputs label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: #94a3b8;
}

.time-inputs input {
  width: 64px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #e5e7eb;
  font-size: 11px;
}

.hint {
  font-size: 10px;
  color: #64748b;
}

</style>

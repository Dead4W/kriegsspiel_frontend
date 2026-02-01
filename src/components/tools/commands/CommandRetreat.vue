<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

/* ===== ACTION ===== */

function apply() {
  const cmd = new RetreatCommand({ elapsed: 0 })

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


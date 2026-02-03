<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'
import { FormationType } from '@/engine'
import { ChangeFormationCommand } from '@/engine/units/commands/changeFormationCommand'

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()

/* ================= STATE ================= */

const selectedFormation = ref<FormationType | null>(null)

const FORMATIONS: FormationType[] = [
  FormationType.Default,
  FormationType.Column,
  FormationType.Springing,
  FormationType.KneelingVolley,
  FormationType.ForceWalking,
  FormationType.OnHorse,
]

/* ================= ACTIONS ================= */

function confirm() {
  if (!selectedFormation.value) return

  for (const unit of props.units) {
    const cmd = new ChangeFormationCommand({
      newFormation: selectedFormation.value,
      elapsed: 0,
    })

    unit.addCommand(cmd.getState())
    unit.setDirty()
  }

  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
  emit('close')
}

function cancel() {
  emit('close')
}

defineExpose({
  confirm,
})

</script>

<template>
  <div class="order-change-formation">
    <!-- ===== TITLE ===== -->
    <div class="column">
      <div class="title">
        {{ t('tools.command.changeFormation') }}
      </div>

      <!-- ===== FORMATION BUTTONS ===== -->
      <div class="formation-buttons">
        <button
          v-for="f in FORMATIONS"
          :key="f"
          class="formation-btn"
          :class="{ active: selectedFormation === f }"
          @click="selectedFormation = f"
        >
          {{ t(`formation.${f}`) }}
        </button>
      </div>
    </div>

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button
        class="btn confirm"
        :disabled="!selectedFormation"
        @click="confirm"
        :title="`${t('hotkey')}: E`"
      >
        {{ t('tools.command.apply') }}
      </button>

      <button class="btn cancel" @click="cancel" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.order-change-formation {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: #020617ee;
  border-top: 1px solid #334155;
  font-size: 11px;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.column.actions {
  justify-content: flex-end;
}

.title {
  font-size: 10px;
  color: #94a3b8;
}

.formation-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.formation-btn {
  padding: 4px 8px;
  font-size: 10px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #cbd5f5;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.formation-btn:hover {
  border-color: #475569;
}

.formation-btn.active {
  border-color: #22c55e;
  box-shadow: 0 0 0 1px #22c55e55 inset;
  color: #e5e7eb;
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

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

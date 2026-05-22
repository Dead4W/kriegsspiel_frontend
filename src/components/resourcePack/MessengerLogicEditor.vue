<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MessengerLogicDraft } from '@/components/resourcePack/types'

const { t } = useI18n()

const props = defineProps<{
  messengerLogic: MessengerLogicDraft
}>()
const emit = defineEmits<{
  'update:messengerLogic': [value: MessengerLogicDraft]
}>()

function numberModel(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function getEventNumber(event: Event): number {
  return Number((event.target as HTMLInputElement | null)?.value ?? '')
}

function patchMessengerLogic(patch: Partial<MessengerLogicDraft>) {
  emit('update:messengerLogic', {
    ...props.messengerLogic,
    ...patch,
  })
}

function updateSpawnHpDelta(event: Event) {
  patchMessengerLogic({ spawnHpDelta: getEventNumber(event) })
}

function updateReturnHpDelta(event: Event) {
  patchMessengerLogic({ returnHpDelta: getEventNumber(event) })
}

function updateEnemyKillChancePerTick(event: Event) {
  patchMessengerLogic({ enemyKillChancePerTick: getEventNumber(event) })
}
</script>

<template>
  <div class="messenger-logic-editor">
    <div class="field">
      <label>{{ t('resourcePackCreator.messengerLogicEditor.spawnHpDelta') }}</label>
      <input
        :value="numberModel(messengerLogic.spawnHpDelta, -1)"
        type="number"
        step="1"
        @input="updateSpawnHpDelta"
      >
    </div>

    <div class="field">
      <label>{{ t('resourcePackCreator.messengerLogicEditor.returnHpDelta') }}</label>
      <input
        :value="numberModel(messengerLogic.returnHpDelta, 1)"
        type="number"
        step="1"
        @input="updateReturnHpDelta"
      >
    </div>

    <div class="field">
      <label>{{ t('resourcePackCreator.messengerLogicEditor.enemyKillChancePerTick') }}</label>
      <input
        :value="numberModel(messengerLogic.enemyKillChancePerTick, 0.1)"
        type="number"
        min="0"
        max="1"
        step="0.01"
        @input="updateEnemyKillChancePerTick"
      >
    </div>
  </div>
</template>

<style scoped>
.messenger-logic-editor {
  display: grid;
  gap: 0.8rem;
}

.field {
  display: grid;
  gap: 0.35rem;
}

.field label {
  color: var(--text-soft);
  font-size: 0.86rem;
}
</style>


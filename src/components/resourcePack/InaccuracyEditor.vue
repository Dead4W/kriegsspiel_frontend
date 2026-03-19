<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ResourcePackInaccuracy } from '@/components/resourcePack/types'

const props = defineProps<{
  inaccuracy: ResourcePackInaccuracy
}>()

const { t } = useI18n()

function updateField(key: keyof ResourcePackInaccuracy, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    delete props.inaccuracy[key]
    return
  }

  props.inaccuracy[key] = nextValue
}

function parseOptionalNumber(rawValue: string): number | null {
  const normalized = rawValue.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function getEventValue(event: Event): string {
  return (event.target as HTMLInputElement | null)?.value ?? ''
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.inaccuracyEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.inaccuracyEditor.subtitle') }}</p>
      </div>
    </div>

    <div class="field-grid">
      <label class="field">
        <span>{{ t('resourcePackCreator.inaccuracyEditor.fields.heightFactor') }}</span>
        <input
          type="number"
          step="0.1"
          inputmode="decimal"
          :value="inaccuracy.heightFactor ?? ''"
          @input="updateField('heightFactor', getEventValue($event))"
        />
      </label>

      <label class="field">
        <span>{{ t('resourcePackCreator.inaccuracyEditor.fields.distanceFactor') }}</span>
        <input
          type="number"
          step="0.01"
          inputmode="decimal"
          :value="inaccuracy.distanceFactor ?? ''"
          @input="updateField('distanceFactor', getEventValue($event))"
        />
      </label>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border: 1px solid rgba(100, 116, 139, 0.36);
  border-radius: var(--radius-md);
  padding: 1rem;
  background: rgba(15, 23, 42, 0.46);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.panel-header h2 {
  margin: 0;
}

.panel-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.help-copy {
  margin: 0.55rem 0 0;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 220px));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.field {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.field span {
  font-size: 0.74rem;
  color: var(--text-soft);
}

.field input {
  width: 100%;
  min-height: 1.7rem;
  min-width: 0;
  padding: 0.14rem 0.35rem;
  border-radius: var(--radius-sm);
  font-size: 0.76rem;
  font-family: inherit;
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: normal;
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
}

@media (max-width: 680px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>

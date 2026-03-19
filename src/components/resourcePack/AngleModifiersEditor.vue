<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createAngleModifier } from '@/components/resourcePack/factories'
import type { ResourcePackAngleModifier } from '@/components/resourcePack/types'

const props = defineProps<{
  modifiers: ResourcePackAngleModifier[]
}>()

const { t } = useI18n()
const modifierCardsRef = ref<HTMLElement[]>([])
const renderKeys = new WeakMap<ResourcePackAngleModifier, string>()
let nextRenderKey = 0

function createPoint(): ResourcePackAngleModifier {
  const lastAngle = props.modifiers[props.modifiers.length - 1]?.angle ?? -1
  return createAngleModifier(lastAngle + 1, 1)
}

async function addPoint() {
  props.modifiers.push(createPoint())
  await nextTick()
  const card = modifierCardsRef.value[modifierCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removePoint(index: number) {
  props.modifiers.splice(index, 1)
}

function updatePoint(point: ResourcePackAngleModifier, key: 'angle' | 'modifier', rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return
  point[key] = nextValue
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

function getRenderKey(point: ResourcePackAngleModifier, index: number): string {
  let renderKey = renderKeys.get(point)
  if (!renderKey) {
    renderKey = `angle-modifier-${index}-${nextRenderKey++}`
    renderKeys.set(point, renderKey)
  }

  return renderKey
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.angleModifiersEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.angleModifiersEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addPoint">
        {{ t('resourcePackCreator.angleModifiersEditor.addPoint') }}
      </button>
    </div>

    <div v-if="!modifiers.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.angleModifiersEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.angleModifiersEditor.emptyText') }}</p>
    </div>

    <div v-else class="modifier-list">
      <article
        v-for="(point, index) in modifiers"
        :key="getRenderKey(point, index)"
        class="modifier-card"
        :ref="(el) => { if (el) modifierCardsRef[index] = el as HTMLElement }"
      >
        <header class="modifier-header">
          <div>
            <span class="modifier-index">{{ index + 1 }}</span>
            <h3>{{ point.angle }}deg</h3>
          </div>

          <button type="button" class="secondary danger" @click="removePoint(index)">
            {{ t('resourcePackCreator.angleModifiersEditor.removePoint') }}
          </button>
        </header>

        <div class="field-grid">
          <label class="field">
            <span>{{ t('resourcePackCreator.angleModifiersEditor.fields.angle') }}</span>
            <input
              type="number"
              step="0.1"
              inputmode="decimal"
              :value="point.angle"
              @input="updatePoint(point, 'angle', getEventValue($event))"
            />
          </label>

          <label class="field">
            <span>{{ t('resourcePackCreator.angleModifiersEditor.fields.modifier') }}</span>
            <input
              type="number"
              step="0.05"
              inputmode="decimal"
              :value="point.modifier"
              @input="updatePoint(point, 'modifier', getEventValue($event))"
            />
          </label>
        </div>
      </article>
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

.panel-header h2,
.modifier-header h3 {
  margin: 0;
}

.panel-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.modifier-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.modifier-card {
  display: grid;
  gap: 0.6rem;
  padding: 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.modifier-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.modifier-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.modifier-header h3 {
  font-size: 0.88rem;
}

.modifier-index {
  min-width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-contrast);
  background: var(--accent);
  flex: 0 0 auto;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
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

.empty-state {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding: 0.8rem;
  border-radius: var(--radius-md);
  border: 1px dashed rgba(148, 163, 184, 0.35);
  color: var(--text-soft);
}

.empty-state p {
  margin: 0;
}

.primary,
.secondary {
  min-height: 1.7rem;
  padding: 0.22rem 0.5rem;
  font-size: 0.78rem;
  font-family: inherit;
  font-weight: 500;
  line-height: 1.1;
}

.primary {
  background: var(--accent);
  color: var(--accent-contrast);
  border-color: var(--accent);
}

.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  filter: none;
}

.secondary {
  background: rgba(15, 23, 42, 0.4);
  color: var(--text);
  border-color: rgba(148, 163, 184, 0.4);
}

.danger {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.35);
}

@media (max-width: 1100px) {
  .modifier-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .modifier-list,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .modifier-header {
    align-items: flex-start;
  }

  .modifier-header button,
  .panel-header button {
    width: 100%;
  }
}
</style>

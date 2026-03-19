<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createFormationState } from '@/components/resourcePack/factories'
import type { FormationState as FormationType, FormationStatKey } from '@/components/resourcePack/types'

const props = defineProps<{
  formations: FormationType[]
}>()

const { t, te } = useI18n()
const formationCardsRef = ref<HTMLElement[]>([])
const formationRenderKeys = new WeakMap<FormationType, string>()
let nextFormationRenderKey = 0
const statKeys: FormationStatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]

function createFormation(): FormationType {
  const nextIndex = props.formations.length + 1
  return createFormationState(nextIndex)
}

async function addFormation() {
  props.formations.push(createFormation())
  await nextTick()
  const card = formationCardsRef.value[formationCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeFormation(index: number) {
  props.formations.splice(index, 1)
}

function updateTitle(formation: FormationType, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    formation.title = nextValue
    const nextId = makeIdFromTitle(nextValue)
    if (nextId) {
      formation.id = nextId
    }
    return
  }

  delete formation.title
}

function updateIcon(formation: FormationType, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    formation.icon = nextValue
    return
  }

  delete formation.icon
}

function updateMultiplier(formation: FormationType, statKey: FormationStatKey, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeMultiplier(formation, statKey)
    return
  }

  ensureMultipliers(formation)[statKey] = nextValue
}

function getUsedMultiplierKeys(formation: FormationType): FormationStatKey[] {
  return statKeys.filter((key) => formation.multipliers?.[key] != null)
}

function getAvailableStatKeys(formation: FormationType, currentKey?: FormationStatKey): FormationStatKey[] {
  return statKeys.filter((key) => key === currentKey || formation.multipliers?.[key] == null)
}

function addMultiplier(formation: FormationType) {
  const [nextKey] = getAvailableStatKeys(formation)
  if (!nextKey) return
  ensureMultipliers(formation)[nextKey] = 1
}

function removeMultiplier(formation: FormationType, statKey: FormationStatKey) {
  if (!formation.multipliers) return
  delete formation.multipliers[statKey]
  cleanupMultipliers(formation)
}

function renameMultiplier(formation: FormationType, fromKey: FormationStatKey, toKeyRaw: string) {
  const toKey = toKeyRaw as FormationStatKey
  const multipliers = formation.multipliers
  if (fromKey === toKey || !multipliers) return
  const value = multipliers[fromKey]
  delete multipliers[fromKey]
  multipliers[toKey] = typeof value === 'number' ? value : 1
}

function cleanupMultipliers(formation: FormationType) {
  if (!formation.multipliers || Object.keys(formation.multipliers).length > 0) return
  delete formation.multipliers
}

function ensureMultipliers(formation: FormationType) {
  return (formation.multipliers ??= {})
}

function parseOptionalNumber(rawValue: string): number | null {
  const normalized = rawValue.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function getEventValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
}

function makeIdFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getFormationLabel(formation: FormationType, index: number): string {
  const customTitle = formation.title?.trim()
  if (customTitle) return customTitle

  const id = formation.id?.trim()
  if (id && te(`formation.${id}`)) {
    return t(`formation.${id}`)
  }

  return id || `Formation ${index + 1}`
}

function getFormationRenderKey(formation: FormationType, index: number): string {
  let renderKey = formationRenderKeys.get(formation)
  if (!renderKey) {
    renderKey = formation.id?.trim() || `formation-type-${index}-${nextFormationRenderKey++}`
    formationRenderKeys.set(formation, renderKey)
  }

  return renderKey
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.formationsEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.formationsEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addFormation">
        {{ t('resourcePackCreator.formationsEditor.addFormation') }}
      </button>
    </div>

    <div v-if="!formations.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.formationsEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.formationsEditor.emptyText') }}</p>
    </div>

    <div v-else class="formation-list">
      <article
        v-for="(formation, index) in formations"
        :key="getFormationRenderKey(formation, index)"
        class="formation-card"
        :ref="(el) => { if (el) formationCardsRef[index] = el as HTMLElement }"
      >
        <header class="formation-header">
          <div>
            <span class="formation-index">{{ index + 1 }}</span>
            <h3>{{ getFormationLabel(formation, index) }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeFormation(index)">
            {{ t('resourcePackCreator.formationsEditor.removeFormation') }}
          </button>
        </header>

        <div class="field-grid">
          <label class="field title-field">
            <span>{{ t('resourcePackCreator.formationsEditor.fields.title') }}</span>
            <input
              :value="formation.title ?? ''"
              autocomplete="off"
              @input="updateTitle(formation, getEventValue($event))"
            />
          </label>

          <label class="field icon-field">
            <span>{{ t('resourcePackCreator.formationsEditor.fields.icon') }}</span>
            <input
              :value="formation.icon ?? ''"
              autocomplete="off"
              @input="updateIcon(formation, getEventValue($event))"
            />
          </label>
        </div>

        <section class="section-block modifier-section">
          <div class="section-header section-header-row">
            <h4>{{ t('resourcePackCreator.formationsEditor.multipliersTitle') }}</h4>
            <button
              type="button"
              class="secondary compact-btn add-modifier-btn"
              :disabled="!getAvailableStatKeys(formation).length"
              @click="addMultiplier(formation)"
            >
              {{ t('resourcePackCreator.formationsEditor.addModifier') }}
            </button>
          </div>

          <div v-if="getUsedMultiplierKeys(formation).length" class="multiplier-list">
            <div v-for="statKey in getUsedMultiplierKeys(formation)" :key="statKey" class="multiplier-row">
              <label class="field modifier-key-field">
                <select :value="statKey" @change="renameMultiplier(formation, statKey, getEventValue($event))">
                  <option v-for="key in getAvailableStatKeys(formation, statKey)" :key="key" :value="key">
                    {{ t(`stat.${key}`) }}
                  </option>
                </select>
              </label>

              <label class="field modifier-value-field">
                <input
                  type="number"
                  step="0.05"
                  inputmode="decimal"
                  :value="formation.multipliers?.[statKey] ?? 1"
                  @input="updateMultiplier(formation, statKey, getEventValue($event))"
                />
              </label>

              <button
                type="button"
                class="secondary danger compact-btn remove-modifier-btn"
                @click="removeMultiplier(formation, statKey)"
              >
                {{ t('resourcePackCreator.formationsEditor.removeModifier') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.formationsEditor.emptyModifiers') }}
          </div>
        </section>
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
.section-header h4,
.formation-header h3 {
  margin: 0;
}

.panel-header p,
.section-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.formation-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.formation-card {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.45rem;
  padding: 0.55rem;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.formation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.formation-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.formation-header h3 {
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.formation-index {
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
  gap: 0.5rem;
  grid-template-columns: minmax(0, 1fr) 96px;
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

.field input,
.field select {
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

.icon-field {
  width: 96px;
}

.multiplier-list {
  display: grid;
  gap: 0.35rem;
}

.multiplier-row {
  display: grid;
  grid-template-columns: 130px 56px 64px;
  gap: 0.3rem;
  align-items: end;
}

.modifier-key-field {
  width: 130px;
}

.modifier-value-field {
  width: 56px;
}

.modifier-value-field input {
  text-align: center;
  padding: 0 !important;
}

.add-modifier-btn {
  width: 92px;
}

.remove-modifier-btn {
  width: 64px;
}

.section-block {
  display: grid;
  gap: 0.45rem;
  align-content: start;
}

.modifier-section {
  min-block-size: 7.2em;
}

.section-header {
  display: grid;
  gap: 0.1rem;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.section-header h4 {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.empty-inline {
  font-size: 0.8rem;
  color: var(--text-muted);
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

.compact-btn {
  min-height: 1.55rem;
  padding: 0.18rem 0.4rem;
  font-size: 0.74rem;
  line-height: 1.1;
  white-space: nowrap;
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
  .formation-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .formation-list {
    grid-template-columns: 1fr;
  }

  .formation-card {
    grid-template-rows: none;
  }

  .formation-header {
    align-items: flex-start;
  }

  .field-grid,
  .multiplier-row {
    grid-template-columns: 1fr;
  }

  .modifier-section {
    min-block-size: 0;
  }

  .icon-field,
  .modifier-key-field,
  .modifier-value-field,
  .add-modifier-btn,
  .remove-modifier-btn {
    width: 100%;
  }

  .formation-header button,
  .panel-header button {
    width: 100%;
  }
}
</style>

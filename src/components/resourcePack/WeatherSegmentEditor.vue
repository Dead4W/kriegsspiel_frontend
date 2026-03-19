<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createWeatherCondition } from '@/components/resourcePack/factories'
import type { WeatherCondition, WeatherStatKey } from '@/components/resourcePack/types'

type WeatherEffectType = '' | 'fog' | 'clouds'
type EffectOption = {
  value: WeatherEffectType
  labelKey: string
}

const props = defineProps<{
  conditions: WeatherCondition[]
}>()

const { t, te } = useI18n()
const conditionCardsRef = ref<HTMLElement[]>([])
const conditionRenderKeys = new WeakMap<WeatherCondition, string>()
let nextConditionRenderKey = 0
const effectOptions: EffectOption[] = [
  { value: '', labelKey: 'resourcePackCreator.weatherEditor.effect.none' },
  { value: 'clouds', labelKey: 'resourcePackCreator.weatherEditor.effect.clouds' },
  { value: 'fog', labelKey: 'resourcePackCreator.weatherEditor.effect.fog' },
]
const statKeys: WeatherStatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]

function createCondition(): WeatherCondition {
  const nextIndex = props.conditions.length + 1
  return createWeatherCondition(nextIndex)
}

async function addCondition() {
  props.conditions.push(createCondition())
  await nextTick()
  const card = conditionCardsRef.value[conditionCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeCondition(index: number) {
  props.conditions.splice(index, 1)
}

function updateTitle(condition: WeatherCondition, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    condition.title = nextValue
    const nextId = makeIdFromTitle(nextValue)
    if (nextId) {
      condition.id = nextId
    }
    return
  }
  delete condition.title
}

function getEffectType(condition: WeatherCondition): WeatherEffectType {
  return condition.effect?.type ?? ''
}

function setEffectType(condition: WeatherCondition, value: string) {
  if (value === 'fog') {
    condition.effect = { type: 'fog', mult: condition.effect?.type === 'fog' ? condition.effect.mult : 1 }
    return
  }

  if (value === 'clouds') {
    condition.effect = { type: 'clouds' }
    return
  }

  delete condition.effect
}

function updateFogIntensity(condition: WeatherCondition, rawValue: string) {
  if (condition.effect?.type !== 'fog') return
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    delete condition.effect.mult
    return
  }
  condition.effect.mult = nextValue
}

function updateMultiplier(condition: WeatherCondition, statKey: WeatherStatKey, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeMultiplier(condition, statKey)
    return
  }

  ensureMultipliers(condition)[statKey] = nextValue
}

function getUsedMultiplierKeys(condition: WeatherCondition): WeatherStatKey[] {
  return statKeys.filter((key) => condition.multipliers?.[key] != null)
}

function getAvailableStatKeys(condition: WeatherCondition, currentKey?: WeatherStatKey): WeatherStatKey[] {
  return statKeys.filter((key) => key === currentKey || condition.multipliers?.[key] == null)
}

function addMultiplier(condition: WeatherCondition) {
  const [nextKey] = getAvailableStatKeys(condition)
  if (!nextKey) return
  ensureMultipliers(condition)[nextKey] = 1
}

function removeMultiplier(condition: WeatherCondition, statKey: WeatherStatKey) {
  if (!condition.multipliers) return
  delete condition.multipliers[statKey]
  cleanupMultipliers(condition)
}

function renameMultiplier(condition: WeatherCondition, fromKey: WeatherStatKey, toKeyRaw: string) {
  const toKey = toKeyRaw as WeatherStatKey
  const multipliers = condition.multipliers
  if (fromKey === toKey || !multipliers) return
  const value = multipliers[fromKey]
  delete multipliers[fromKey]
  multipliers[toKey] = typeof value === 'number' ? value : 1
}

function cleanupMultipliers(condition: WeatherCondition) {
  if (!condition.multipliers || Object.keys(condition.multipliers).length > 0) return
  delete condition.multipliers
}

function ensureMultipliers(condition: WeatherCondition) {
  return (condition.multipliers ??= {})
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

function getConditionLabel(condition: WeatherCondition, index: number): string {
  const customTitle = condition.title?.trim()
  if (customTitle) return customTitle

  const id = condition.id?.trim()
  if (id && te(`weather.${id}`)) {
    return t(`weather.${id}`)
  }

  return id || `Weather ${index + 1}`
}

function getConditionRenderKey(condition: WeatherCondition, index: number): string {
  let renderKey = conditionRenderKeys.get(condition)
  if (!renderKey) {
    renderKey = condition.id?.trim() || `weather-condition-${index}-${nextConditionRenderKey++}`
    conditionRenderKeys.set(condition, renderKey)
  }

  return renderKey
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.weatherEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.weatherEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addCondition">
        {{ t('resourcePackCreator.weatherEditor.addCondition') }}
      </button>
    </div>

    <div v-if="!conditions.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.weatherEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.weatherEditor.emptyText') }}</p>
    </div>

    <div v-else class="condition-list">
      <article
        v-for="(condition, index) in conditions"
        :key="getConditionRenderKey(condition, index)"
        class="condition-card"
        :ref="(el) => { if (el) conditionCardsRef[index] = el as HTMLElement }"
      >
        <header class="condition-header">
          <div>
            <span class="condition-index">{{ index + 1 }}</span>
            <h3>{{ getConditionLabel(condition, index) }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeCondition(index)">
            {{ t('resourcePackCreator.weatherEditor.removeCondition') }}
          </button>
        </header>

        <div class="field-grid single-field-row">
          <label class="field title-field">
            <span>{{ t('resourcePackCreator.weatherEditor.fields.title') }}</span>
            <input
              :value="condition.title ?? ''"
              autocomplete="off"
              @input="updateTitle(condition, getEventValue($event))"
            />
          </label>
        </div>

        <section class="section-block effect-section">
          <div class="section-header">
            <h4>{{ t('resourcePackCreator.weatherEditor.effectTitle') }}</h4>
          </div>

          <div class="field-grid effect-grid">
            <label class="field effect-type-field">
              <span>{{ t('resourcePackCreator.weatherEditor.fields.effect') }}</span>
              <select :value="getEffectType(condition)" @change="setEffectType(condition, getEventValue($event))">
                <option
                  v-for="option in effectOptions"
                  :key="option.value || 'none'"
                  :value="option.value"
                >
                  {{ t(option.labelKey) }}
                </option>
              </select>
            </label>

            <label v-if="condition.effect?.type === 'fog'" class="field fog-value-field">
              <span>{{ t('resourcePackCreator.weatherEditor.fields.fogIntensity') }}</span>
              <input
                type="number"
                step="0.1"
                inputmode="decimal"
                :value="condition.effect.mult ?? ''"
                @input="updateFogIntensity(condition, getEventValue($event))"
              />
            </label>
          </div>
        </section>

        <section class="section-block modifier-section">
          <div class="section-header section-header-row">
            <h4>{{ t('resourcePackCreator.weatherEditor.multipliersTitle') }}</h4>
            <button
              type="button"
              class="secondary compact-btn add-modifier-btn"
              :disabled="!getAvailableStatKeys(condition).length"
              @click="addMultiplier(condition)"
            >
              {{ t('resourcePackCreator.weatherEditor.addModifier') }}
            </button>
          </div>

          <div v-if="getUsedMultiplierKeys(condition).length" class="multiplier-list">
            <div v-for="statKey in getUsedMultiplierKeys(condition)" :key="statKey" class="multiplier-row">
              <label class="field modifier-key-field">
                <select :value="statKey" @change="renameMultiplier(condition, statKey, getEventValue($event))">
                  <option v-for="key in getAvailableStatKeys(condition, statKey)" :key="key" :value="key">
                    {{ t(`stat.${key}`) }}
                  </option>
                </select>
              </label>

              <label class="field modifier-value-field">
                <input
                  type="number"
                  step="0.05"
                  inputmode="decimal"
                  :value="condition.multipliers?.[statKey] ?? 1"
                  @input="updateMultiplier(condition, statKey, getEventValue($event))"
                />
              </label>

              <button
                type="button"
                class="secondary danger compact-btn remove-modifier-btn"
                @click="removeMultiplier(condition, statKey)"
              >
                {{ t('resourcePackCreator.weatherEditor.removeModifier') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.weatherEditor.emptyModifiers') }}
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
.condition-header h3 {
  margin: 0;
}

.panel-header p,
.section-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.help-copy {
  margin: 0.55rem 0 0;
  color: var(--text-soft);
  font-size: 0.88rem;
}

.condition-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.condition-card {
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  gap: 0.45rem;
  padding: 0.55rem;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.condition-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.condition-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.condition-header h3 {
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-index {
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
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.single-field-row {
  grid-template-columns: 1fr;
}

.effect-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 150px 96px;
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

.title-field {
  width: 100%;
}

.effect-type-field {
  width: 150px;
}

.fog-value-field {
  width: 96px;
}

.modifier-key-field {
  width: 130px;
}

.modifier-value-field {
  width: 56px;
}

.modifier-value-field input {
  text-align: center;
  padding: 0!important;
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

.effect-section {
  min-block-size: 4.8em;
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
  .condition-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .condition-list {
    grid-template-columns: 1fr;
  }

  .condition-card {
    grid-template-rows: none;
  }

  .condition-header {
    align-items: flex-start;
  }

  .effect-grid {
    grid-template-columns: 1fr;
  }

  .effect-section,
  .modifier-section {
    min-block-size: 0;
  }

  .multiplier-row {
    grid-template-columns: 1fr;
  }

  .effect-type-field,
  .fog-value-field,
  .modifier-key-field,
  .modifier-value-field,
  .add-modifier-btn,
  .remove-modifier-btn {
    width: 100%;
  }

  .condition-header button,
  .panel-header button {
    width: 100%;
  }
}
</style>

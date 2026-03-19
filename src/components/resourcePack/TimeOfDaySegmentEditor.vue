<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createTimeSegment } from '@/components/resourcePack/factories'
import type { TimeOfDaySegment, TimeStatKey } from '@/components/resourcePack/types'

const props = defineProps<{
  segments: TimeOfDaySegment[]
}>()

const { t, te } = useI18n()
const segmentCardsRef = ref<HTMLElement[]>([])
const segmentRenderKeys = new WeakMap<TimeOfDaySegment, string>()
let nextSegmentRenderKey = 0
const statKeys: TimeStatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]

function createSegment(): TimeOfDaySegment {
  const nextIndex = props.segments.length + 1
  const fallbackStart = props.segments[props.segments.length - 1]?.end ?? 0
  return createTimeSegment(nextIndex, fallbackStart)
}

async function addSegment() {
  props.segments.push(createSegment())
  await nextTick()
  const card = segmentCardsRef.value[segmentCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeSegment(index: number) {
  props.segments.splice(index, 1)
}

function updateTitle(segment: TimeOfDaySegment, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    segment.title = nextValue
    const nextId = makeIdFromTitle(nextValue)
    if (nextId) {
      segment.id = nextId
    }
    return
  }

  delete segment.title
}

function updateHour(segment: TimeOfDaySegment, key: 'start' | 'end', rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return
  segment[key] = nextValue
}

function updateMultiplier(segment: TimeOfDaySegment, statKey: TimeStatKey, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeMultiplier(segment, statKey)
    return
  }

  ensureMultipliers(segment)[statKey] = nextValue
}

function getUsedMultiplierKeys(segment: TimeOfDaySegment): TimeStatKey[] {
  return statKeys.filter((key) => segment.multipliers?.[key] != null)
}

function getAvailableStatKeys(segment: TimeOfDaySegment, currentKey?: TimeStatKey): TimeStatKey[] {
  return statKeys.filter((key) => key === currentKey || segment.multipliers?.[key] == null)
}

function addMultiplier(segment: TimeOfDaySegment) {
  const [nextKey] = getAvailableStatKeys(segment)
  if (!nextKey) return
  ensureMultipliers(segment)[nextKey] = 1
}

function removeMultiplier(segment: TimeOfDaySegment, statKey: TimeStatKey) {
  if (!segment.multipliers) return
  delete segment.multipliers[statKey]
  cleanupMultipliers(segment)
}

function renameMultiplier(segment: TimeOfDaySegment, fromKey: TimeStatKey, toKeyRaw: string) {
  const toKey = toKeyRaw as TimeStatKey
  const multipliers = segment.multipliers
  if (fromKey === toKey || !multipliers) return
  const value = multipliers[fromKey]
  delete multipliers[fromKey]
  multipliers[toKey] = typeof value === 'number' ? value : 1
}

function cleanupMultipliers(segment: TimeOfDaySegment) {
  if (!segment.multipliers || Object.keys(segment.multipliers).length > 0) return
  delete segment.multipliers
}

function ensureMultipliers(segment: TimeOfDaySegment) {
  return (segment.multipliers ??= {})
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

function getSegmentLabel(segment: TimeOfDaySegment, index: number): string {
  const customTitle = segment.title?.trim()
  if (customTitle) return customTitle

  const id = segment.id?.trim()
  if (id && te(`time.${id}`)) {
    return t(`time.${id}`)
  }

  return id || `Time ${index + 1}`
}

function getSegmentRenderKey(segment: TimeOfDaySegment, index: number): string {
  let renderKey = segmentRenderKeys.get(segment)
  if (!renderKey) {
    renderKey = segment.id?.trim() || `time-segment-${index}-${nextSegmentRenderKey++}`
    segmentRenderKeys.set(segment, renderKey)
  }

  return renderKey
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.timeOfDayEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.timeOfDayEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addSegment">
        {{ t('resourcePackCreator.timeOfDayEditor.addSegment') }}
      </button>
    </div>

    <div v-if="!segments.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.timeOfDayEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.timeOfDayEditor.emptyText') }}</p>
    </div>

    <div v-else class="segment-list">
      <article
        v-for="(segment, index) in segments"
        :key="getSegmentRenderKey(segment, index)"
        class="segment-card"
        :ref="(el) => { if (el) segmentCardsRef[index] = el as HTMLElement }"
      >
        <header class="segment-header">
          <div>
            <span class="segment-index">{{ index + 1 }}</span>
            <h3>{{ getSegmentLabel(segment, index) }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeSegment(index)">
            {{ t('resourcePackCreator.timeOfDayEditor.removeSegment') }}
          </button>
        </header>

        <div class="field-grid single-field-row">
          <label class="field title-field">
            <span>{{ t('resourcePackCreator.timeOfDayEditor.fields.title') }}</span>
            <input
              :value="segment.title ?? ''"
              autocomplete="off"
              @input="updateTitle(segment, getEventValue($event))"
            />
          </label>

        </div>

        <div class="field-grid hour-grid">
          <label class="field hour-field">
            <span>{{ t('resourcePackCreator.timeOfDayEditor.fields.start') }}</span>
            <input
              type="number"
              step="1"
              min="0"
              max="24"
              inputmode="numeric"
              :value="segment.start"
              @input="updateHour(segment, 'start', getEventValue($event))"
            />
          </label>

          <label class="field hour-field">
            <span>{{ t('resourcePackCreator.timeOfDayEditor.fields.end') }}</span>
            <input
              type="number"
              step="1"
              min="0"
              max="24"
              inputmode="numeric"
              :value="segment.end"
              @input="updateHour(segment, 'end', getEventValue($event))"
            />
          </label>
        </div>

        <section class="section-block modifier-section">
          <div class="section-header section-header-row">
            <h4>{{ t('resourcePackCreator.timeOfDayEditor.multipliersTitle') }}</h4>
            <button
              type="button"
              class="secondary compact-btn add-modifier-btn"
              :disabled="!getAvailableStatKeys(segment).length"
              @click="addMultiplier(segment)"
            >
              {{ t('resourcePackCreator.timeOfDayEditor.addModifier') }}
            </button>
          </div>

          <div v-if="getUsedMultiplierKeys(segment).length" class="multiplier-list">
            <div v-for="statKey in getUsedMultiplierKeys(segment)" :key="statKey" class="multiplier-row">
              <label class="field modifier-key-field">
                <select :value="statKey" @change="renameMultiplier(segment, statKey, getEventValue($event))">
                  <option v-for="key in getAvailableStatKeys(segment, statKey)" :key="key" :value="key">
                    {{ t(`stat.${key}`) }}
                  </option>
                </select>
              </label>

              <label class="field modifier-value-field">
                <input
                  type="number"
                  step="0.05"
                  inputmode="decimal"
                  :value="segment.multipliers?.[statKey] ?? 1"
                  @input="updateMultiplier(segment, statKey, getEventValue($event))"
                />
              </label>

              <button
                type="button"
                class="secondary danger compact-btn remove-modifier-btn"
                @click="removeMultiplier(segment, statKey)"
              >
                {{ t('resourcePackCreator.timeOfDayEditor.removeModifier') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.timeOfDayEditor.emptyModifiers') }}
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
.segment-header h3 {
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

.segment-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.segment-card {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.45rem;
  padding: 0.55rem;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.segment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.segment-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.segment-header h3 {
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.segment-index {
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

.hour-grid {
  grid-template-columns: 96px 96px;
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

.title-field {
  width: 100%;
}

.hour-field {
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
  .segment-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .segment-list {
    grid-template-columns: 1fr;
  }

  .segment-card {
    grid-template-rows: none;
  }

  .segment-header {
    align-items: flex-start;
  }

  .hour-grid,
  .multiplier-row {
    grid-template-columns: 1fr;
  }

  .modifier-section {
    min-block-size: 0;
  }

  .hour-field,
  .modifier-key-field,
  .modifier-value-field,
  .add-modifier-btn,
  .remove-modifier-btn {
    width: 100%;
  }

  .segment-header button,
  .panel-header button {
    width: 100%;
  }
}
</style>

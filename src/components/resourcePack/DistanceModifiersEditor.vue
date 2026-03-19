<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createDistanceModifierPoint } from '@/components/resourcePack/factories'
import type { ResourcePackDistanceModifierPoint, ResourcePackDistanceModifiers } from '@/components/resourcePack/types'

const props = defineProps<{
  tables: ResourcePackDistanceModifiers
}>()

const { t } = useI18n()
const tableCardsRef = ref<HTMLElement[]>([])

function getTableKeys(): string[] {
  return Object.keys(props.tables)
}

function getPoints(tableKey: string): ResourcePackDistanceModifierPoint[] {
  return (props.tables[tableKey] ??= [])
}

function createPoint(tableKey: string): ResourcePackDistanceModifierPoint {
  const points = getPoints(tableKey)
  const lastDistance = points[points.length - 1]?.distance ?? 100
  return createDistanceModifierPoint(lastDistance + 100, 1)
}

function getNextTableKey(): string {
  if (!Object.keys(props.tables).length && !props.tables.default) return 'default'

  let index = 1
  let nextKey = `table_${index}`
  while (props.tables[nextKey]) {
    index += 1
    nextKey = `table_${index}`
  }
  return nextKey
}

async function addTable() {
  const nextKey = getNextTableKey()
  props.tables[nextKey] = [createDistanceModifierPoint()]
  await nextTick()
  const card = tableCardsRef.value[Object.keys(props.tables).indexOf(nextKey)]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeTable(tableKey: string) {
  delete props.tables[tableKey]
}

function renameTable(fromKey: string, rawValue: string) {
  const nextKey = makeId(rawValue)
  if (!nextKey || nextKey === fromKey || props.tables[nextKey]) return
  const points = getPoints(fromKey)
  delete props.tables[fromKey]
  props.tables[nextKey] = points
}

function addPoint(tableKey: string) {
  getPoints(tableKey).push(createPoint(tableKey))
}

function removePoint(tableKey: string, index: number) {
  getPoints(tableKey).splice(index, 1)
}

function updatePoint(
  point: ResourcePackDistanceModifierPoint,
  key: 'distance' | 'modifier',
  rawValue: string,
) {
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

function makeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getEventValue(event: Event): string {
  return (event.target as HTMLInputElement | null)?.value ?? ''
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.distanceModifiersEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.distanceModifiersEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addTable">
        {{ t('resourcePackCreator.distanceModifiersEditor.addTable') }}
      </button>
    </div>

    <div v-if="!getTableKeys().length" class="empty-state">
      <strong>{{ t('resourcePackCreator.distanceModifiersEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.distanceModifiersEditor.emptyText') }}</p>
    </div>

    <div v-else class="table-list">
      <article
        v-for="(tableKey, tableIndex) in getTableKeys()"
        :key="tableKey"
        class="table-card"
        :ref="(el) => { if (el) tableCardsRef[tableIndex] = el as HTMLElement }"
      >
        <header class="table-header">
          <div>
            <span class="table-index">{{ tableIndex + 1 }}</span>
            <h3>{{ tableKey }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeTable(tableKey)">
            {{ t('resourcePackCreator.distanceModifiersEditor.removeTable') }}
          </button>
        </header>

        <label class="field table-key-field">
          <span>{{ t('resourcePackCreator.distanceModifiersEditor.fields.tableKey') }}</span>
          <input :value="tableKey" autocomplete="off" @change="renameTable(tableKey, getEventValue($event))" />
        </label>

        <section class="section-block">
          <div class="section-header">
            <h4>{{ t('resourcePackCreator.distanceModifiersEditor.pointsTitle') }}</h4>
            <button type="button" class="secondary compact-btn" @click="addPoint(tableKey)">
              {{ t('resourcePackCreator.distanceModifiersEditor.addPoint') }}
            </button>
          </div>

          <div v-if="getPoints(tableKey).length" class="point-list">
            <div
              v-for="(point, pointIndex) in getPoints(tableKey)"
              :key="`${tableKey}-${pointIndex}`"
              class="point-row"
            >
              <label class="field point-distance-field">
                <span>{{ t('resourcePackCreator.distanceModifiersEditor.fields.distance') }}</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  inputmode="numeric"
                  :value="point.distance"
                  @input="updatePoint(point, 'distance', getEventValue($event))"
                />
              </label>

              <label class="field point-modifier-field">
                <span>{{ t('resourcePackCreator.distanceModifiersEditor.fields.modifier') }}</span>
                <input
                  type="number"
                  step="0.05"
                  inputmode="decimal"
                  :value="point.modifier"
                  @input="updatePoint(point, 'modifier', getEventValue($event))"
                />
              </label>

              <button
                type="button"
                class="secondary danger compact-btn"
                @click="removePoint(tableKey, pointIndex)"
              >
                {{ t('resourcePackCreator.distanceModifiersEditor.removePoint') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.distanceModifiersEditor.emptyPoints') }}
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
.table-header h3,
.section-header h4 {
  margin: 0;
}

.panel-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.table-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.table-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.table-header,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.table-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.table-header h3 {
  font-size: 0.9rem;
}

.table-index {
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

.section-header h4 {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.section-block {
  display: grid;
  gap: 0.45rem;
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

.table-key-field {
  max-width: 220px;
}

.point-list {
  display: grid;
  gap: 0.35rem;
}

.point-row {
  display: grid;
  grid-template-columns: 160px 120px 88px;
  gap: 0.45rem;
  align-items: end;
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

@media (max-width: 680px) {
  .point-row {
    grid-template-columns: 1fr;
  }

  .table-header,
  .section-header {
    align-items: flex-start;
  }

  .table-header button,
  .section-header button,
  .panel-header button,
  .table-key-field {
    width: 100%;
    max-width: none;
  }
}
</style>

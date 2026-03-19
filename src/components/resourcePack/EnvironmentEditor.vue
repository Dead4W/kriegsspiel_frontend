<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createEnvironmentState } from '@/components/resourcePack/factories'
import type { EnvironmentState, EnvironmentStatKey } from '@/components/resourcePack/types'

type UnitTypeOption = {
  id: string
  label: string
}

const props = defineProps<{
  states: EnvironmentState[]
  unitTypeOptions: UnitTypeOption[]
}>()

const { t, te } = useI18n()
const stateCardsRef = ref<HTMLElement[]>([])
const stateRenderKeys = new WeakMap<EnvironmentState, string>()
let nextStateRenderKey = 0

const statKeys: EnvironmentStatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
]

function createState(): EnvironmentState {
  const nextIndex = props.states.length + 1
  return createEnvironmentState(nextIndex)
}

async function addState() {
  props.states.push(createState())
  await nextTick()
  const card = stateCardsRef.value[stateCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeState(index: number) {
  props.states.splice(index, 1)
}

function updateTitle(state: EnvironmentState, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    state.title = nextValue
    const nextId = makeIdFromTitle(nextValue)
    if (nextId) {
      state.id = nextId
    }
    return
  }

  delete state.title
}

function updateIcon(state: EnvironmentState, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    state.icon = nextValue
    return
  }

  delete state.icon
}

function updateIsRoute(state: EnvironmentState, value: boolean) {
  if (value) {
    state.isRoute = true
    return
  }

  delete state.isRoute
}

function updateMoraleCheckMod(state: EnvironmentState, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    if (state.params) {
      delete state.params.moraleCheckMod
      cleanupParams(state)
    }
    return
  }

  ensureParams(state).moraleCheckMod = nextValue
}

function updateMultiplier(state: EnvironmentState, statKey: EnvironmentStatKey, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeMultiplier(state, statKey)
    return
  }

  ensureMultipliers(state)[statKey] = nextValue
}

function getUsedMultiplierKeys(state: EnvironmentState): EnvironmentStatKey[] {
  return statKeys.filter((key) => state.multipliers?.[key] != null)
}

function getAvailableStatKeys(state: EnvironmentState, currentKey?: EnvironmentStatKey): EnvironmentStatKey[] {
  return statKeys.filter((key) => key === currentKey || state.multipliers?.[key] == null)
}

function addMultiplier(state: EnvironmentState) {
  const [nextKey] = getAvailableStatKeys(state)
  if (!nextKey) return
  ensureMultipliers(state)[nextKey] = 1
}

function removeMultiplier(state: EnvironmentState, statKey: EnvironmentStatKey) {
  if (!state.multipliers) return
  delete state.multipliers[statKey]
  cleanupMultipliers(state)
}

function renameMultiplier(state: EnvironmentState, fromKey: EnvironmentStatKey, toKeyRaw: string) {
  const toKey = toKeyRaw as EnvironmentStatKey
  const multipliers = state.multipliers
  if (fromKey === toKey || !multipliers) return
  const value = multipliers[fromKey]
  delete multipliers[fromKey]
  multipliers[toKey] = typeof value === 'number' ? value : 1
}

function getUsedTypeKeys(state: EnvironmentState): string[] {
  return Object.keys(state.byTypes ?? {})
}

function getAvailableTypeOptions(state: EnvironmentState, currentKey?: string): UnitTypeOption[] {
  const available = props.unitTypeOptions.filter(
    (option) => option.id === currentKey || state.byTypes?.[option.id] == null
  )
  if (currentKey && !available.some((option) => option.id === currentKey)) {
    available.unshift({
      id: currentKey,
      label: getUnitTypeLabel(currentKey),
    })
  }
  return available
}

function addTypeOverride(state: EnvironmentState) {
  const [nextOption] = getAvailableTypeOptions(state)
  if (!nextOption) return
  ensureTypeMultipliers(state, nextOption.id).damage = 1
}

function removeTypeOverride(state: EnvironmentState, typeKey: string) {
  if (!state.byTypes) return
  delete state.byTypes[typeKey]
  cleanupByTypes(state)
}

function renameTypeOverride(state: EnvironmentState, fromKey: string, toKey: string) {
  const byTypes = state.byTypes
  if (!byTypes || fromKey === toKey || !toKey) return
  const value = byTypes[fromKey]
  delete byTypes[fromKey]
  byTypes[toKey] = value && Object.keys(value).length ? value : { damage: 1 }
}

function getUsedTypeMultiplierKeys(state: EnvironmentState, typeKey: string): EnvironmentStatKey[] {
  return statKeys.filter((key) => state.byTypes?.[typeKey]?.[key] != null)
}

function getAvailableTypeStatKeys(
  state: EnvironmentState,
  typeKey: string,
  currentKey?: EnvironmentStatKey
): EnvironmentStatKey[] {
  return statKeys.filter((key) => key === currentKey || state.byTypes?.[typeKey]?.[key] == null)
}

function addTypeMultiplier(state: EnvironmentState, typeKey: string) {
  const [nextKey] = getAvailableTypeStatKeys(state, typeKey)
  if (!nextKey) return
  ensureTypeMultipliers(state, typeKey)[nextKey] = 1
}

function updateTypeMultiplier(
  state: EnvironmentState,
  typeKey: string,
  statKey: EnvironmentStatKey,
  rawValue: string
) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeTypeMultiplier(state, typeKey, statKey)
    return
  }

  ensureTypeMultipliers(state, typeKey)[statKey] = nextValue
}

function removeTypeMultiplier(state: EnvironmentState, typeKey: string, statKey: EnvironmentStatKey) {
  const typeMultipliers = state.byTypes?.[typeKey]
  if (!typeMultipliers) return
  delete typeMultipliers[statKey]
  cleanupTypeMultipliers(state, typeKey)
}

function renameTypeMultiplier(
  state: EnvironmentState,
  typeKey: string,
  fromKey: EnvironmentStatKey,
  toKeyRaw: string
) {
  const toKey = toKeyRaw as EnvironmentStatKey
  const typeMultipliers = state.byTypes?.[typeKey]
  if (fromKey === toKey || !typeMultipliers) return
  const value = typeMultipliers[fromKey]
  delete typeMultipliers[fromKey]
  typeMultipliers[toKey] = typeof value === 'number' ? value : 1
}

function cleanupMultipliers(state: EnvironmentState) {
  if (!state.multipliers || Object.keys(state.multipliers).length > 0) return
  delete state.multipliers
}

function cleanupTypeMultipliers(state: EnvironmentState, typeKey: string) {
  const typeMultipliers = state.byTypes?.[typeKey]
  if (typeMultipliers && Object.keys(typeMultipliers).length > 0) return
  if (state.byTypes) {
    delete state.byTypes[typeKey]
  }
  cleanupByTypes(state)
}

function cleanupByTypes(state: EnvironmentState) {
  if (!state.byTypes || Object.keys(state.byTypes).length > 0) return
  delete state.byTypes
}

function cleanupParams(state: EnvironmentState) {
  if (!state.params || Object.keys(state.params).length > 0) return
  delete state.params
}

function ensureParams(state: EnvironmentState) {
  return (state.params ??= {})
}

function ensureMultipliers(state: EnvironmentState) {
  return (state.multipliers ??= {})
}

function ensureTypeMultipliers(state: EnvironmentState, typeKey: string) {
  const byTypes = (state.byTypes ??= {})
  return (byTypes[typeKey] ??= {})
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

function getEventChecked(event: Event): boolean {
  return Boolean((event.target as HTMLInputElement | null)?.checked)
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

function getStateLabel(state: EnvironmentState, index: number): string {
  const customTitle = state.title?.trim()
  if (customTitle) return customTitle

  const id = state.id?.trim()
  if (id && te(`env.${id}`)) {
    return t(`env.${id}`)
  }

  return id || `Environment ${index + 1}`
}

function getUnitTypeLabel(unitTypeId: string): string {
  const option = props.unitTypeOptions.find((entry) => entry.id === unitTypeId)
  if (option) return option.label
  if (te(`unit.${unitTypeId}`)) return t(`unit.${unitTypeId}`)
  return unitTypeId
}

function getStateRenderKey(state: EnvironmentState, index: number): string {
  let renderKey = stateRenderKeys.get(state)
  if (!renderKey) {
    renderKey = state.id?.trim() || `environment-state-${index}-${nextStateRenderKey++}`
    stateRenderKeys.set(state, renderKey)
  }

  return renderKey
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.environmentEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.environmentEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addState">
        {{ t('resourcePackCreator.environmentEditor.addState') }}
      </button>
    </div>

    <div v-if="!states.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.environmentEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.environmentEditor.emptyText') }}</p>
    </div>

    <div v-else class="state-list">
      <article
        v-for="(state, index) in states"
        :key="getStateRenderKey(state, index)"
        class="state-card"
        :ref="(el) => { if (el) stateCardsRef[index] = el as HTMLElement }"
      >
        <header class="state-header">
          <div>
            <span class="state-index">{{ index + 1 }}</span>
            <h3>{{ getStateLabel(state, index) }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeState(index)">
            {{ t('resourcePackCreator.environmentEditor.removeState') }}
          </button>
        </header>

        <div class="field-grid details-grid">
          <label class="field title-field">
            <span>{{ t('resourcePackCreator.environmentEditor.fields.title') }}</span>
            <input
              :value="state.title ?? ''"
              autocomplete="off"
              @input="updateTitle(state, getEventValue($event))"
            />
          </label>

          <label class="field icon-field">
            <span>{{ t('resourcePackCreator.environmentEditor.fields.icon') }}</span>
            <input :value="state.icon ?? ''" autocomplete="off" @input="updateIcon(state, getEventValue($event))" />
          </label>

          <label class="field morale-field">
            <span>{{ t('resourcePackCreator.environmentEditor.fields.moraleCheckMod') }}</span>
            <input
              type="number"
              step="1"
              inputmode="decimal"
              :value="state.params?.moraleCheckMod ?? ''"
              @input="updateMoraleCheckMod(state, getEventValue($event))"
            />
          </label>

          <label class="field checkbox-field">
            <span>{{ t('resourcePackCreator.environmentEditor.fields.isRoute') }}</span>
            <input
              type="checkbox"
              :checked="state.isRoute === true"
              @change="updateIsRoute(state, getEventChecked($event))"
            />
          </label>
        </div>

        <section class="section-block modifier-section">
          <div class="section-header section-header-row">
            <h4>{{ t('resourcePackCreator.environmentEditor.multipliersTitle') }}</h4>
            <button
              type="button"
              class="secondary compact-btn add-modifier-btn"
              :disabled="!getAvailableStatKeys(state).length"
              @click="addMultiplier(state)"
            >
              {{ t('resourcePackCreator.environmentEditor.addModifier') }}
            </button>
          </div>

          <div v-if="getUsedMultiplierKeys(state).length" class="multiplier-list">
            <div v-for="statKey in getUsedMultiplierKeys(state)" :key="statKey" class="multiplier-row">
              <label class="field modifier-key-field">
                <select :value="statKey" @change="renameMultiplier(state, statKey, getEventValue($event))">
                  <option v-for="key in getAvailableStatKeys(state, statKey)" :key="key" :value="key">
                    {{ t(`stat.${key}`) }}
                  </option>
                </select>
              </label>

              <label class="field modifier-value-field">
                <input
                  type="number"
                  step="0.05"
                  inputmode="decimal"
                  :value="state.multipliers?.[statKey] ?? 1"
                  @input="updateMultiplier(state, statKey, getEventValue($event))"
                />
              </label>

              <button
                type="button"
                class="secondary danger compact-btn remove-modifier-btn"
                @click="removeMultiplier(state, statKey)"
              >
                {{ t('resourcePackCreator.environmentEditor.removeModifier') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.environmentEditor.emptyModifiers') }}
          </div>
        </section>

        <section class="section-block type-section">
          <div class="section-header section-header-row">
            <h4>{{ t('resourcePackCreator.environmentEditor.perTypeTitle') }}</h4>
            <button
              type="button"
              class="secondary compact-btn add-type-btn"
              :disabled="!getAvailableTypeOptions(state).length"
              @click="addTypeOverride(state)"
            >
              {{ t('resourcePackCreator.environmentEditor.addTypeOverride') }}
            </button>
          </div>

          <div v-if="getUsedTypeKeys(state).length" class="type-list">
            <article v-for="typeKey in getUsedTypeKeys(state)" :key="typeKey" class="type-card">
              <div class="type-card-header">
                <label class="field type-field">
                  <span>{{ t('resourcePackCreator.environmentEditor.fields.unitType') }}</span>
                  <select :value="typeKey" @change="renameTypeOverride(state, typeKey, getEventValue($event))">
                    <option
                      v-for="option in getAvailableTypeOptions(state, typeKey)"
                      :key="option.id"
                      :value="option.id"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <button type="button" class="secondary danger compact-btn remove-type-btn" @click="removeTypeOverride(state, typeKey)">
                  {{ t('resourcePackCreator.environmentEditor.removeTypeOverride') }}
                </button>
              </div>

              <div class="section-header section-header-row nested-section-header">
                <h5>{{ t('resourcePackCreator.environmentEditor.typeMultipliersTitle') }}</h5>
                <button
                  type="button"
                  class="secondary compact-btn add-modifier-btn"
                  :disabled="!getAvailableTypeStatKeys(state, typeKey).length"
                  @click="addTypeMultiplier(state, typeKey)"
                >
                  {{ t('resourcePackCreator.environmentEditor.addModifier') }}
                </button>
              </div>

              <div v-if="getUsedTypeMultiplierKeys(state, typeKey).length" class="multiplier-list">
                <div
                  v-for="statKey in getUsedTypeMultiplierKeys(state, typeKey)"
                  :key="`${typeKey}-${statKey}`"
                  class="multiplier-row"
                >
                  <label class="field modifier-key-field">
                    <select :value="statKey" @change="renameTypeMultiplier(state, typeKey, statKey, getEventValue($event))">
                      <option v-for="key in getAvailableTypeStatKeys(state, typeKey, statKey)" :key="key" :value="key">
                        {{ t(`stat.${key}`) }}
                      </option>
                    </select>
                  </label>

                  <label class="field modifier-value-field">
                    <input
                      type="number"
                      step="0.05"
                      inputmode="decimal"
                      :value="state.byTypes?.[typeKey]?.[statKey] ?? 1"
                      @input="updateTypeMultiplier(state, typeKey, statKey, getEventValue($event))"
                    />
                  </label>

                  <button
                    type="button"
                    class="secondary danger compact-btn remove-modifier-btn"
                    @click="removeTypeMultiplier(state, typeKey, statKey)"
                  >
                    {{ t('resourcePackCreator.environmentEditor.removeModifier') }}
                  </button>
                </div>
              </div>

              <div v-else class="empty-inline">
                {{ t('resourcePackCreator.environmentEditor.emptyModifiers') }}
              </div>
            </article>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.environmentEditor.emptyTypeOverrides') }}
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
.section-header h5,
.state-header h3 {
  margin: 0;
}

.panel-header p,
.section-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.state-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.state-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.55rem;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.state-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.state-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.state-header h3 {
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-index {
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
}

.details-grid {
  grid-template-columns: minmax(0, 1fr) 88px 120px 110px;
  align-items: end;
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

.checkbox-field {
  justify-items: start;
}

.checkbox-field input {
  width: auto;
  min-height: auto;
  margin: 0.35rem 0 0;
  accent-color: var(--accent);
}

.multiplier-list,
.type-list {
  display: grid;
  gap: 0.35rem;
}

.multiplier-row {
  display: grid;
  grid-template-columns: 130px 56px 64px;
  gap: 0.3rem;
  align-items: end;
}

.type-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.4);
}

.type-card-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.type-field {
  width: 180px;
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

.section-block {
  display: grid;
  gap: 0.45rem;
  align-content: start;
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

.section-header h4,
.section-header h5 {
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

.add-modifier-btn,
.add-type-btn {
  width: 92px;
}

.remove-modifier-btn,
.remove-type-btn {
  width: 64px;
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
  .state-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 780px) {
  .details-grid,
  .multiplier-row {
    grid-template-columns: 1fr;
  }

  .type-card-header {
    align-items: stretch;
  }

  .type-field,
  .modifier-key-field,
  .modifier-value-field,
  .add-modifier-btn,
  .add-type-btn,
  .remove-modifier-btn,
  .remove-type-btn {
    width: 100%;
  }

  .state-header button,
  .panel-header button {
    width: 100%;
  }
}
</style>

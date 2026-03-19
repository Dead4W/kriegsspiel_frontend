<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createAbilityState } from '@/components/resourcePack/factories'
import type { AbilityState as AbilityType, AbilityStatKey } from '@/components/resourcePack/types'

const props = defineProps<{
  abilities: AbilityType[]
}>()

const { t, te } = useI18n()
const abilityCardsRef = ref<HTMLElement[]>([])
const abilityRenderKeys = new WeakMap<AbilityType, string>()
let nextAbilityRenderKey = 0
const statKeys: AbilityStatKey[] = [
  'damage',
  'takeDamageMod',
  'speed',
  'attackRange',
  'visionRange',
  'fatigue',
]

function createAbility(): AbilityType {
  const nextIndex = props.abilities.length + 1
  return createAbilityState(nextIndex)
}

async function addAbility() {
  props.abilities.push(createAbility())
  await nextTick()
  const card = abilityCardsRef.value[abilityCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeAbility(index: number) {
  props.abilities.splice(index, 1)
}

function updateTitle(ability: AbilityType, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    ability.title = nextValue
    const nextId = makeIdFromTitle(nextValue)
    if (nextId) {
      ability.id = nextId
    }
    return
  }

  delete ability.title
}

function updateRadius(ability: AbilityType, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeRadius(ability)
    return
  }

  ensureParams(ability).radius = nextValue
}

function removeRadius(ability: AbilityType) {
  if (!ability.params) return
  delete ability.params.radius
  cleanupParams(ability)
}

function updateMultiplier(ability: AbilityType, statKey: AbilityStatKey, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeMultiplier(ability, statKey)
    return
  }

  ensureMultipliers(ability)[statKey] = nextValue
}

function getUsedMultiplierKeys(ability: AbilityType): AbilityStatKey[] {
  return statKeys.filter((key) => ability.multipliers?.[key] != null)
}

function getAvailableStatKeys(ability: AbilityType, currentKey?: AbilityStatKey): AbilityStatKey[] {
  return statKeys.filter((key) => key === currentKey || ability.multipliers?.[key] == null)
}

function addMultiplier(ability: AbilityType) {
  const [nextKey] = getAvailableStatKeys(ability)
  if (!nextKey) return
  ensureMultipliers(ability)[nextKey] = 1
}

function removeMultiplier(ability: AbilityType, statKey: AbilityStatKey) {
  if (!ability.multipliers) return
  delete ability.multipliers[statKey]
  cleanupMultipliers(ability)
}

function renameMultiplier(ability: AbilityType, fromKey: AbilityStatKey, toKeyRaw: string) {
  const toKey = toKeyRaw as AbilityStatKey
  const multipliers = ability.multipliers
  if (fromKey === toKey || !multipliers) return
  const value = multipliers[fromKey]
  delete multipliers[fromKey]
  multipliers[toKey] = typeof value === 'number' ? value : 1
}

function cleanupMultipliers(ability: AbilityType) {
  if (!ability.multipliers || Object.keys(ability.multipliers).length > 0) return
  delete ability.multipliers
}

function ensureMultipliers(ability: AbilityType) {
  return (ability.multipliers ??= {})
}

function cleanupParams(ability: AbilityType) {
  if (!ability.params || Object.keys(ability.params).length > 0) return
  delete ability.params
}

function ensureParams(ability: AbilityType) {
  return (ability.params ??= {})
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

function getAbilityLabel(ability: AbilityType, index: number): string {
  const customTitle = ability.title?.trim()
  if (customTitle) return customTitle

  const id = ability.id?.trim()
  if (id && te(`ability.${id}`)) {
    return t(`ability.${id}`)
  }

  return id || `Ability ${index + 1}`
}

function getAbilityRenderKey(ability: AbilityType, index: number): string {
  let renderKey = abilityRenderKeys.get(ability)
  if (!renderKey) {
    renderKey = ability.id?.trim() || `ability-type-${index}-${nextAbilityRenderKey++}`
    abilityRenderKeys.set(ability, renderKey)
  }

  return renderKey
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.abilitiesEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.abilitiesEditor.subtitle') }}</p>
      </div>

      <button type="button" class="primary" @click="addAbility">
        {{ t('resourcePackCreator.abilitiesEditor.addAbility') }}
      </button>
    </div>

    <div v-if="!abilities.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.abilitiesEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.abilitiesEditor.emptyText') }}</p>
    </div>

    <div v-else class="ability-list">
      <article
        v-for="(ability, index) in abilities"
        :key="getAbilityRenderKey(ability, index)"
        class="ability-card"
        :ref="(el) => { if (el) abilityCardsRef[index] = el as HTMLElement }"
      >
        <header class="ability-header">
          <div>
            <span class="ability-index">{{ index + 1 }}</span>
            <h3>{{ getAbilityLabel(ability, index) }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeAbility(index)">
            {{ t('resourcePackCreator.abilitiesEditor.removeAbility') }}
          </button>
        </header>

        <div class="field-grid">
          <label class="field title-field">
            <span>{{ t('resourcePackCreator.abilitiesEditor.fields.title') }}</span>
            <input
              :value="ability.title ?? ''"
              autocomplete="off"
              @input="updateTitle(ability, getEventValue($event))"
            />
          </label>

          <label class="field radius-field">
            <span>{{ t('resourcePackCreator.abilitiesEditor.fields.radius') }}</span>
            <input
              type="number"
              step="0.05"
              inputmode="decimal"
              :value="ability.params?.radius ?? ''"
              @input="updateRadius(ability, getEventValue($event))"
            />
          </label>
        </div>

        <section class="section-block modifier-section">
          <div class="section-header section-header-row">
            <div>
              <h4>{{ t('resourcePackCreator.abilitiesEditor.multipliersTitle') }}</h4>
              <p>{{ t('resourcePackCreator.abilitiesEditor.multipliersSubtitle') }}</p>
            </div>

            <button
              type="button"
              class="secondary compact-btn add-modifier-btn"
              :disabled="!getAvailableStatKeys(ability).length"
              @click="addMultiplier(ability)"
            >
              {{ t('resourcePackCreator.abilitiesEditor.addModifier') }}
            </button>
          </div>

          <div v-if="getUsedMultiplierKeys(ability).length" class="multiplier-list">
            <div v-for="statKey in getUsedMultiplierKeys(ability)" :key="statKey" class="multiplier-row">
              <label class="field modifier-key-field">
                <select :value="statKey" @change="renameMultiplier(ability, statKey, getEventValue($event))">
                  <option v-for="key in getAvailableStatKeys(ability, statKey)" :key="key" :value="key">
                    {{ t(`stat.${key}`) }}
                  </option>
                </select>
              </label>

              <label class="field modifier-value-field">
                <input
                  type="number"
                  step="0.05"
                  inputmode="decimal"
                  :value="ability.multipliers?.[statKey] ?? 1"
                  @input="updateMultiplier(ability, statKey, getEventValue($event))"
                />
              </label>

              <button
                type="button"
                class="secondary danger compact-btn remove-modifier-btn"
                @click="removeMultiplier(ability, statKey)"
              >
                {{ t('resourcePackCreator.abilitiesEditor.removeModifier') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.abilitiesEditor.emptyModifiers') }}
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
.ability-header h3 {
  margin: 0;
}

.panel-header p,
.section-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.ability-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.ability-card {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.45rem;
  padding: 0.55rem;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.ability-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ability-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.ability-header h3 {
  font-size: 0.88rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ability-index {
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
  grid-template-columns: minmax(0, 1fr) 124px;
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

.radius-field {
  width: 124px;
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
  min-block-size: 8em;
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
  .ability-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .ability-list {
    grid-template-columns: 1fr;
  }

  .ability-card {
    grid-template-rows: none;
  }

  .ability-header {
    align-items: flex-start;
  }

  .field-grid,
  .multiplier-row {
    grid-template-columns: 1fr;
  }

  .modifier-section {
    min-block-size: 0;
  }

  .radius-field,
  .modifier-key-field,
  .modifier-value-field,
  .add-modifier-btn,
  .remove-modifier-btn {
    width: 100%;
  }

  .ability-header button,
  .panel-header button {
    width: 100%;
  }
}
</style>

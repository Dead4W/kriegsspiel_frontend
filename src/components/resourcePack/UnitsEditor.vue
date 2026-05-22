<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createUnitType } from '@/components/resourcePack/factories'
import type {
  ResourcePackUnitParams,
  ResourcePackUnitType,
} from '@/components/resourcePack/types'

type Option = {
  id: string
  label: string
}

type TextParamKey =
  | 'textureUrl'
  | 'renderIcon'
type NumberParamKey =
  | 'renderWidthMult'
  | 'renderHeightMult'
  | 'priorityTargets'
  | 'suppressionThreshold'
  | 'attackIgnoreTargetEnvMult'
  | 'moraleCheckMod'

const props = defineProps<{
  units: ResourcePackUnitType[]
  abilityOptions: Option[]
  formationOptions: Option[]
  environmentOptions: Option[]
}>()

const { t, te, locale } = useI18n()
const unitCardsRef = ref<HTMLElement[]>([])
const unitRenderKeys = new WeakMap<ResourcePackUnitType, string>()
let nextUnitRenderKey = 0

const statKeys = [
  'maxHp',
  'damage',
  'speed',
  'takeDamageMod',
  'attackRange',
  'visionRange',
  'ammoMax',
] as const

const statLabelKeys: Record<(typeof statKeys)[number], string> = {
  maxHp: 'stat.hp',
  damage: 'stat.damage',
  speed: 'stat.speed',
  takeDamageMod: 'stat.takeDamageMod',
  attackRange: 'stat.attackRange',
  visionRange: 'stat.visionRange',
  ammoMax: 'stat.ammo',
}
const wikiLink = computed(() => ({
  name: 'wiki',
  params: { locale: locale.value },
  query: { section: 'resourcepack', tab: 'unit' },
}))

function createUnit(): ResourcePackUnitType {
  const nextIndex = props.units.length + 1
  return createUnitType(nextIndex)
}

async function addUnit() {
  props.units.push(createUnit())
  await nextTick()
  const card = unitCardsRef.value[unitCardsRef.value.length - 1]
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function removeUnit(index: number) {
  props.units.splice(index, 1)
}

function updateTitle(unit: ResourcePackUnitType, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    unit.title = nextValue
    const nextId = makeIdFromTitle(nextValue)
    if (nextId) {
      unit.id = nextId
    }
    return
  }

  delete unit.title
}

const unitTagOptions = ['cant_swim'] as const

function getTagOptions(unit: ResourcePackUnitType): string[] {
  const known = [...unitTagOptions]
  const existing = Array.isArray(unit.tags) ? unit.tags : []
  return [...new Set([...known, ...existing])]
}

function hasTag(unit: ResourcePackUnitType, tag: string): boolean {
  return Array.isArray(unit.tags) ? unit.tags.includes(tag) : false
}

function updateTag(unit: ResourcePackUnitType, tag: string, enabled: boolean) {
  const current = Array.isArray(unit.tags) ? unit.tags : []
  const next = enabled
    ? Array.from(new Set([...current, tag]))
    : current.filter((entry) => entry !== tag)

  if (next.length) {
    unit.tags = next
    return
  }
  delete unit.tags
}

function toggleTag(unit: ResourcePackUnitType, tag: string) {
  updateTag(unit, tag, !hasTag(unit, tag))
}

function updateStat(unit: ResourcePackUnitType, key: (typeof statKeys)[number], rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return
  unit.stats[key] = nextValue
}

function updateDefaultFormation(unit: ResourcePackUnitType, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    unit.defaultFormation = nextValue
    return
  }

  delete unit.defaultFormation
}

function getAbilityEntries(unit: ResourcePackUnitType): string[] {
  return Array.isArray(unit.abilities) ? unit.abilities : []
}

function ensureAbilityEntries(unit: ResourcePackUnitType): string[] {
  return (unit.abilities ??= [])
}

function cleanupAbilityEntries(unit: ResourcePackUnitType) {
  if (!Array.isArray(unit.abilities) || unit.abilities.length > 0) return
  delete unit.abilities
}

function getAvailableAbilityOptions(unit: ResourcePackUnitType, currentId?: string): Option[] {
  const usedIds = new Set(getAbilityEntries(unit))
  const available = props.abilityOptions.filter((option) => option.id === currentId || !usedIds.has(option.id))
  if (currentId && !available.some((option) => option.id === currentId)) {
    available.unshift({
      id: currentId,
      label: getAbilityLabel(currentId),
    })
  }
  return available
}

function addAbility(unit: ResourcePackUnitType) {
  const [nextOption] = getAvailableAbilityOptions(unit)
  if (!nextOption) return
  ensureAbilityEntries(unit).push(nextOption.id)
}

function updateAbility(unit: ResourcePackUnitType, index: number, value: string) {
  const nextValue = value.trim()
  if (!nextValue) return
  ensureAbilityEntries(unit)[index] = nextValue
}

function removeAbility(unit: ResourcePackUnitType, index: number) {
  if (!Array.isArray(unit.abilities)) return
  unit.abilities.splice(index, 1)
  cleanupAbilityEntries(unit)
}

function updateTextParam(unit: ResourcePackUnitType, key: TextParamKey, value: string) {
  const nextValue = value.trim()
  if (nextValue) {
    ensureParams(unit)[key] = nextValue
    return
  }

  removeParam(unit, key)
}

function updateNumberParam(unit: ResourcePackUnitType, key: NumberParamKey, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) {
    removeParam(unit, key)
    return
  }

  ensureParams(unit)[key] = nextValue
}

function updateBooleanParam(unit: ResourcePackUnitType, key: 'attackIgnoreHeightModifier', checked: boolean) {
  if (checked) {
    ensureParams(unit)[key] = true
    return
  }

  removeParam(unit, key)
}

function getAttackIgnoreTargetEnvs(unit: ResourcePackUnitType): string[] {
  return Array.isArray(unit.params?.attackIgnoreTargetEnvs) ? unit.params.attackIgnoreTargetEnvs : []
}

function ensureAttackIgnoreTargetEnvs(unit: ResourcePackUnitType): string[] {
  const params = ensureParams(unit)
  if (!Array.isArray(params.attackIgnoreTargetEnvs)) {
    params.attackIgnoreTargetEnvs = []
  }
  return params.attackIgnoreTargetEnvs
}

function cleanupAttackIgnoreTargetEnvs(unit: ResourcePackUnitType) {
  const envs = unit.params?.attackIgnoreTargetEnvs
  if (!Array.isArray(envs) || envs.length > 0) return
  delete unit.params?.attackIgnoreTargetEnvs
  cleanupParams(unit)
}

function getAvailableEnvironmentOptions(unit: ResourcePackUnitType, currentId?: string): Option[] {
  const usedIds = new Set(getAttackIgnoreTargetEnvs(unit))
  const available = props.environmentOptions.filter(
    (option) => option.id === currentId || !usedIds.has(option.id)
  )
  if (currentId && !available.some((option) => option.id === currentId)) {
    available.unshift({
      id: currentId,
      label: getEnvironmentLabel(currentId),
    })
  }
  return available
}

function addAttackIgnoreTargetEnv(unit: ResourcePackUnitType) {
  const [nextOption] = getAvailableEnvironmentOptions(unit)
  if (!nextOption) return
  ensureAttackIgnoreTargetEnvs(unit).push(nextOption.id)
}

function updateAttackIgnoreTargetEnv(unit: ResourcePackUnitType, index: number, value: string) {
  const nextValue = value.trim()
  if (!nextValue) return
  ensureAttackIgnoreTargetEnvs(unit)[index] = nextValue
}

function removeAttackIgnoreTargetEnv(unit: ResourcePackUnitType, index: number) {
  const envs = unit.params?.attackIgnoreTargetEnvs
  if (!Array.isArray(envs)) return
  envs.splice(index, 1)
  cleanupAttackIgnoreTargetEnvs(unit)
}

function removeParam(unit: ResourcePackUnitType, key: keyof ResourcePackUnitParams) {
  if (!unit.params) return
  delete unit.params[key]
  cleanupParams(unit)
}

function ensureParams(unit: ResourcePackUnitType): ResourcePackUnitParams {
  return (unit.params ??= {})
}

function cleanupParams(unit: ResourcePackUnitType) {
  if (!unit.params || Object.keys(unit.params).length > 0) return
  delete unit.params
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

function getCheckedValue(event: Event): boolean {
  return (event.target as HTMLInputElement | null)?.checked === true
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

function getUnitLabel(unit: ResourcePackUnitType, index: number): string {
  const customTitle = unit.title?.trim()
  if (customTitle) return customTitle

  const id = unit.id?.trim()
  if (id && te(`unit.${id}`)) {
    return t(`unit.${id}`)
  }

  return id || `Unit ${index + 1}`
}

function getAbilityLabel(id: string): string {
  const trimmedId = id.trim()
  if (!trimmedId) return ''
  if (te(`ability.${trimmedId}`)) return t(`ability.${trimmedId}`)
  return trimmedId
}

function getEnvironmentLabel(id: string): string {
  const trimmedId = id.trim()
  if (!trimmedId) return ''
  if (te(`env.${trimmedId}`)) return t(`env.${trimmedId}`)
  return trimmedId
}

function getUnitRenderKey(unit: ResourcePackUnitType, index: number): string {
  let renderKey = unitRenderKeys.get(unit)
  if (!renderKey) {
    renderKey = unit.id?.trim() || `unit-type-${index}-${nextUnitRenderKey++}`
    unitRenderKeys.set(unit, renderKey)
  }

  return renderKey
}

function getStatLabel(statKey: (typeof statKeys)[number]): string {
  return t(statLabelKeys[statKey])
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div class="panel-header-copy">
        <h2>{{ t('resourcePackCreator.unitsEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.unitsEditor.subtitle') }}</p>
        <router-link class="panel-wiki-link" :to="wikiLink">
          {{ t('wiki') }}
        </router-link>
      </div>

      <button type="button" class="primary" @click="addUnit">
        {{ t('resourcePackCreator.unitsEditor.addUnit') }}
      </button>
    </div>

    <div v-if="!units.length" class="empty-state">
      <strong>{{ t('resourcePackCreator.unitsEditor.emptyTitle') }}</strong>
      <p>{{ t('resourcePackCreator.unitsEditor.emptyText') }}</p>
    </div>

    <div v-else class="unit-list">
      <article
        v-for="(unit, index) in units"
        :key="getUnitRenderKey(unit, index)"
        class="unit-card"
        :ref="(el) => { if (el) unitCardsRef[index] = el as HTMLElement }"
      >
        <header class="unit-header">
          <div>
            <span class="unit-index">{{ index + 1 }}</span>
            <h3>{{ getUnitLabel(unit, index) }}</h3>
          </div>

          <button type="button" class="secondary danger" @click="removeUnit(index)">
            {{ t('resourcePackCreator.unitsEditor.removeUnit') }}
          </button>
        </header>

        <div class="field-grid meta-grid">
          <label class="field title-field">
            <span>{{ t('resourcePackCreator.unitsEditor.fields.title') }}</span>
            <input :value="unit.title ?? ''" autocomplete="off" @input="updateTitle(unit, getEventValue($event))" />
          </label>

          <label class="field formation-field">
            <span>{{ t('resourcePackCreator.unitsEditor.fields.defaultFormation') }}</span>
            <select :value="unit.defaultFormation ?? ''" @change="updateDefaultFormation(unit, getEventValue($event))">
              <option value="">{{ t('resourcePackCreator.unitsEditor.formations.none') }}</option>
              <option v-for="option in formationOptions" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <section class="section-block">
          <div class="section-header">
            <h4>{{ t('resourcePackCreator.unitsEditor.statsTitle') }}</h4>
          </div>

          <div class="stats-grid">
            <label v-for="statKey in statKeys" :key="statKey" class="field">
              <span>{{ getStatLabel(statKey) }}</span>
              <input
                type="number"
                step="0.05"
                inputmode="decimal"
                :value="unit.stats[statKey]"
                @input="updateStat(unit, statKey, getEventValue($event))"
              />
            </label>
          </div>
        </section>

        <section class="section-block tags-section">
          <div class="section-header">
            <h4>{{ t('resourcePackCreator.unitsEditor.fields.tags') }}</h4>
          </div>
          <div class="tag-options">
            <button
              v-for="tag in getTagOptions(unit)"
              :key="`${unit.id}-tag-${tag}`"
              type="button"
              class="tag-chip"
              :class="{ active: hasTag(unit, tag) }"
              @click="toggleTag(unit, tag)"
            >
              {{ tag }}
            </button>
          </div>
        </section>

        <section class="section-block">
          <div class="section-header section-header-row">
            <div>
              <h4>{{ t('resourcePackCreator.unitsEditor.abilitiesTitle') }}</h4>
              <p>{{ t('resourcePackCreator.unitsEditor.abilitiesSubtitle') }}</p>
            </div>

            <button
              type="button"
              class="secondary compact-btn"
              :disabled="!getAvailableAbilityOptions(unit).length"
              @click="addAbility(unit)"
            >
              {{ t('resourcePackCreator.unitsEditor.addAbility') }}
            </button>
          </div>

          <div v-if="getAbilityEntries(unit).length" class="chip-list">
            <div v-for="(abilityId, abilityIndex) in getAbilityEntries(unit)" :key="`${unit.id}-ability-${abilityIndex}`" class="chip-row">
              <label class="field">
                <select :value="abilityId" @change="updateAbility(unit, abilityIndex, getEventValue($event))">
                  <option
                    v-for="option in getAvailableAbilityOptions(unit, abilityId)"
                    :key="option.id"
                    :value="option.id"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <button type="button" class="secondary danger compact-btn" @click="removeAbility(unit, abilityIndex)">
                {{ t('resourcePackCreator.unitsEditor.removeAbility') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.unitsEditor.emptyAbilities') }}
          </div>
        </section>

        <section class="section-block">
          <div class="section-header">
            <h4>{{ t('resourcePackCreator.unitsEditor.paramsTitle') }}</h4>
            <p>{{ t('resourcePackCreator.unitsEditor.paramsSubtitle') }}</p>
          </div>

          <div class="field-grid params-grid">
            <label class="field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.textureUrl') }}</span>
              <input
                :value="unit.params?.textureUrl ?? ''"
                autocomplete="off"
                @input="updateTextParam(unit, 'textureUrl', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.renderIcon') }}</span>
              <input
                :value="unit.params?.renderIcon ?? ''"
                autocomplete="off"
                @input="updateTextParam(unit, 'renderIcon', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.renderWidthMult') }}</span>
              <input
                type="number"
                step="0.05"
                inputmode="decimal"
                :value="unit.params?.renderWidthMult ?? ''"
                @input="updateNumberParam(unit, 'renderWidthMult', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.renderHeightMult') }}</span>
              <input
                type="number"
                step="0.05"
                inputmode="decimal"
                :value="unit.params?.renderHeightMult ?? ''"
                @input="updateNumberParam(unit, 'renderHeightMult', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.priorityTargets') }}</span>
              <input
                type="number"
                step="1"
                min="1"
                inputmode="numeric"
                :value="unit.params?.priorityTargets ?? ''"
                @input="updateNumberParam(unit, 'priorityTargets', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.suppressionThreshold') }}</span>
              <input
                type="number"
                step="0.05"
                min="0"
                inputmode="decimal"
                :value="unit.params?.suppressionThreshold ?? ''"
                @input="updateNumberParam(unit, 'suppressionThreshold', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.moraleCheckMod') }}</span>
              <input
                type="number"
                step="1"
                inputmode="numeric"
                :value="unit.params?.moraleCheckMod ?? ''"
                @input="updateNumberParam(unit, 'moraleCheckMod', getEventValue($event))"
              />
            </label>

            <label class="field short-field">
              <span>{{ t('resourcePackCreator.unitsEditor.fields.attackIgnoreTargetEnvMult') }}</span>
              <input
                type="number"
                step="0.05"
                inputmode="decimal"
                :value="unit.params?.attackIgnoreTargetEnvMult ?? ''"
                @input="updateNumberParam(unit, 'attackIgnoreTargetEnvMult', getEventValue($event))"
              />
            </label>

            <label class="checkbox-field">
              <input
                type="checkbox"
                :checked="unit.params?.attackIgnoreHeightModifier === true"
                @change="updateBooleanParam(unit, 'attackIgnoreHeightModifier', getCheckedValue($event))"
              />
              <span>{{ t('resourcePackCreator.unitsEditor.fields.attackIgnoreHeightModifier') }}</span>
            </label>
          </div>
        </section>

        <section class="section-block">
          <div class="section-header section-header-row">
            <div>
              <h4>{{ t('resourcePackCreator.unitsEditor.attackIgnoreTargetEnvsTitle') }}</h4>
              <p>{{ t('resourcePackCreator.unitsEditor.attackIgnoreTargetEnvsSubtitle') }}</p>
            </div>

            <button
              type="button"
              class="secondary compact-btn"
              :disabled="!getAvailableEnvironmentOptions(unit).length"
              @click="addAttackIgnoreTargetEnv(unit)"
            >
              {{ t('resourcePackCreator.unitsEditor.addEnvironment') }}
            </button>
          </div>

          <div v-if="getAttackIgnoreTargetEnvs(unit).length" class="chip-list">
            <div
              v-for="(envId, envIndex) in getAttackIgnoreTargetEnvs(unit)"
              :key="`${unit.id}-ignore-env-${envIndex}`"
              class="chip-row"
            >
              <label class="field">
                <select :value="envId" @change="updateAttackIgnoreTargetEnv(unit, envIndex, getEventValue($event))">
                  <option
                    v-for="option in getAvailableEnvironmentOptions(unit, envId)"
                    :key="option.id"
                    :value="option.id"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <button
                type="button"
                class="secondary danger compact-btn"
                @click="removeAttackIgnoreTargetEnv(unit, envIndex)"
              >
                {{ t('resourcePackCreator.unitsEditor.removeEnvironment') }}
              </button>
            </div>
          </div>

          <div v-else class="empty-inline">
            {{ t('resourcePackCreator.unitsEditor.emptyEnvironments') }}
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
.unit-header h3 {
  margin: 0;
}

.panel-header p,
.section-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.panel-header-copy {
  display: grid;
  gap: 0.25rem;
}

.panel-wiki-link {
  width: fit-content;
  font-size: 0.82rem;
  color: var(--accent);
  text-decoration: none;
}

.panel-wiki-link:hover {
  text-decoration: underline;
}

.unit-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.unit-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  background: rgba(2, 6, 23, 0.36);
}

.unit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.unit-header > div {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.unit-header h3 {
  font-size: 0.92rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unit-index {
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

.field-grid,
.stats-grid {
  display: grid;
  gap: 0.5rem;
}

.meta-grid {
  grid-template-columns: minmax(0, 1fr) 180px;
}

.stats-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.params-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.field span,
.checkbox-field span {
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

.formation-field,
.short-field {
  width: 100%;
}

.section-block {
  display: grid;
  gap: 0.45rem;
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

.chip-list {
  display: grid;
  gap: 0.35rem;
}

.chip-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem;
  align-items: end;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.7rem;
}

.checkbox-field input {
  margin: 0;
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  padding: 0.18rem 0.62rem;
  background: rgba(15, 23, 42, 0.3);
  font-size: 0.74rem;
  color: var(--text-soft);
  min-height: 1.6rem;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.tag-chip:hover {
  border-color: rgba(59, 130, 246, 0.45);
  color: var(--text);
  background: rgba(30, 41, 59, 0.5);
}

.tag-chip.active {
  border-color: color-mix(in srgb, var(--accent) 62%, rgba(59, 130, 246, 0.38));
  background: color-mix(in srgb, var(--accent) 22%, rgba(15, 23, 42, 0.45));
  color: var(--text);
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
  .unit-list,
  .params-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .meta-grid,
  .stats-grid,
  .chip-row {
    grid-template-columns: 1fr;
  }

  .unit-header {
    align-items: flex-start;
  }

  .unit-header button,
  .panel-header button,
  .section-header-row button {
    width: 100%;
  }

  .section-header-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>

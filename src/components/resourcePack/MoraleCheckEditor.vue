<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { MoraleCheckConfig, MoraleOutcomeId } from '@/engine/resourcePack/moraleCheck'

type MoraleLossPenalty = MoraleCheckConfig['lossPenalties'][number]
type MoraleOutcome = MoraleCheckConfig['outcomes'][number]

const props = defineProps<{
  moraleCheck: MoraleCheckConfig
}>()

const { t } = useI18n()
const outcomeIds: MoraleOutcomeId[] = ['pass', 'retreat', 'flee', 'disband']

function addLossPenalty() {
  props.moraleCheck.lossPenalties.push(createLossPenalty())
}

function removeLossPenalty(index: number) {
  props.moraleCheck.lossPenalties.splice(index, 1)
}

function updateLossPenaltyLabel(entry: MoraleLossPenalty, value: string) {
  entry.key = value.trim()
}

function updateLossPenaltyNumber(entry: MoraleLossPenalty, key: 'lossesMoreThan' | 'penalty', rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return

  if (key === 'lossesMoreThan') {
    entry.lossesMoreThan = clamp(nextValue, 0, 1)
    return
  }

  entry.penalty = nextValue
}

function addOutcome() {
  const nextId = outcomeIds.find((id) => !props.moraleCheck.outcomes.some((entry) => entry.id === id))
  if (!nextId) return

  props.moraleCheck.outcomes.push({
    minTotal: (props.moraleCheck.outcomes.at(-1)?.minTotal ?? 0) - 1,
    id: nextId,
  })
}

function removeOutcome(index: number) {
  props.moraleCheck.outcomes.splice(index, 1)
}

function updateOutcomeMinTotal(entry: MoraleOutcome, rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return
  entry.minTotal = nextValue
}

function updateOutcomeId(entry: MoraleOutcome, rawValue: string) {
  const nextValue = rawValue as MoraleOutcomeId
  if (!outcomeIds.includes(nextValue)) return
  entry.id = nextValue
}

function updateDice(key: 'count' | 'sides', rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return

  props.moraleCheck.dice[key] = key === 'count' ? Math.max(1, Math.floor(nextValue)) : Math.max(2, Math.floor(nextValue))
}

function updateCommander(key: 'radiusMeters' | 'penalty', rawValue: string) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return

  props.moraleCheck.commander[key] = key === 'radiusMeters' ? Math.max(0, nextValue) : nextValue
}

function updateEffect(
  key: 'retreatDurationSeconds' | 'fleeDurationMultiplier' | 'fleeHpMultiplier',
  rawValue: string,
) {
  const nextValue = parseOptionalNumber(rawValue)
  if (nextValue == null) return

  props.moraleCheck.effects[key] =
    key === 'retreatDurationSeconds' ? Math.max(0, Math.floor(nextValue)) : Math.max(0, nextValue)
}

function getAvailableOutcomeIds(currentId?: MoraleOutcomeId): MoraleOutcomeId[] {
  return outcomeIds.filter((id) => id === currentId || !props.moraleCheck.outcomes.some((entry) => entry.id === id))
}

function getLossPenaltyLabel(entry: MoraleLossPenalty, index: number): string {
  return entry.key.trim() || `Penalty ${index + 1}`
}

function createLossPenalty(): MoraleLossPenalty {
  const lastThreshold = props.moraleCheck.lossPenalties.at(-1)?.lossesMoreThan ?? 0
  const nextThreshold = clamp(Number((lastThreshold + 0.1).toFixed(2)), 0, 1)

  return {
    lossesMoreThan: nextThreshold,
    penalty: -1,
    key: `losses>${Math.round(nextThreshold * 100)}%`,
  }
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.moraleCheckEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.moraleCheckEditor.subtitle') }}</p>
      </div>
    </div>

    <div class="section-grid">
      <section class="section-card">
        <div class="section-header">
          <h3>{{ t('resourcePackCreator.moraleCheckEditor.sections.dice') }}</h3>
        </div>

        <div class="field-grid compact-grid">
          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.diceCount') }}</span>
            <input
              type="number"
              step="1"
              min="1"
              inputmode="numeric"
              :value="moraleCheck.dice.count"
              @input="updateDice('count', getEventValue($event))"
            />
          </label>

          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.diceSides') }}</span>
            <input
              type="number"
              step="1"
              min="2"
              inputmode="numeric"
              :value="moraleCheck.dice.sides"
              @input="updateDice('sides', getEventValue($event))"
            />
          </label>
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <h3>{{ t('resourcePackCreator.moraleCheckEditor.sections.commander') }}</h3>
        </div>

        <div class="field-grid compact-grid">
          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.commanderRadius') }}</span>
            <input
              type="number"
              step="10"
              min="0"
              inputmode="decimal"
              :value="moraleCheck.commander.radiusMeters"
              @input="updateCommander('radiusMeters', getEventValue($event))"
            />
          </label>

          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.commanderPenalty') }}</span>
            <input
              type="number"
              step="1"
              inputmode="numeric"
              :value="moraleCheck.commander.penalty"
              @input="updateCommander('penalty', getEventValue($event))"
            />
          </label>
        </div>
      </section>
    </div>

    <div class="section-grid section-grid-stacked">
      <section class="section-card">
        <div class="section-header section-header-row">
          <h3>{{ t('resourcePackCreator.moraleCheckEditor.sections.lossPenalties') }}</h3>
          <button type="button" class="secondary compact-btn" @click="addLossPenalty">
            {{ t('resourcePackCreator.moraleCheckEditor.addLossPenalty') }}
          </button>
        </div>

        <div v-if="moraleCheck.lossPenalties.length" class="row-list">
          <article v-for="(entry, index) in moraleCheck.lossPenalties" :key="`${entry.key}-${index}`" class="entry-card">
            <header class="entry-header">
              <h4>{{ getLossPenaltyLabel(entry, index) }}</h4>
              <button type="button" class="secondary danger compact-btn" @click="removeLossPenalty(index)">
                {{ t('resourcePackCreator.moraleCheckEditor.removeLossPenalty') }}
              </button>
            </header>

            <div class="field-grid">
              <label class="field">
                <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.lossKey') }}</span>
                <input :value="entry.key" @input="updateLossPenaltyLabel(entry, getEventValue($event))" />
              </label>

              <label class="field">
                <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.lossesMoreThan') }}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  inputmode="decimal"
                  :value="entry.lossesMoreThan"
                  @input="updateLossPenaltyNumber(entry, 'lossesMoreThan', getEventValue($event))"
                />
              </label>

              <label class="field">
                <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.penalty') }}</span>
                <input
                  type="number"
                  step="1"
                  inputmode="numeric"
                  :value="entry.penalty"
                  @input="updateLossPenaltyNumber(entry, 'penalty', getEventValue($event))"
                />
              </label>
            </div>
          </article>
        </div>

        <div v-else class="empty-inline">
          {{ t('resourcePackCreator.moraleCheckEditor.emptyLossPenalties') }}
        </div>
      </section>

      <section class="section-card">
        <div class="section-header section-header-row">
          <h3>{{ t('resourcePackCreator.moraleCheckEditor.sections.outcomes') }}</h3>
          <button
            type="button"
            class="secondary compact-btn"
            :disabled="getAvailableOutcomeIds().length === 0"
            @click="addOutcome"
          >
            {{ t('resourcePackCreator.moraleCheckEditor.addOutcome') }}
          </button>
        </div>

        <div v-if="moraleCheck.outcomes.length" class="row-list">
          <article v-for="(entry, index) in moraleCheck.outcomes" :key="`${entry.id}-${index}`" class="entry-card">
            <header class="entry-header">
              <h4>{{ t(`resourcePackCreator.moraleCheckEditor.outcomeIds.${entry.id}`) }}</h4>
              <button type="button" class="secondary danger compact-btn" @click="removeOutcome(index)">
                {{ t('resourcePackCreator.moraleCheckEditor.removeOutcome') }}
              </button>
            </header>

            <div class="field-grid">
              <label class="field">
                <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.minTotal') }}</span>
                <input
                  type="number"
                  step="1"
                  inputmode="numeric"
                  :value="entry.minTotal"
                  @input="updateOutcomeMinTotal(entry, getEventValue($event))"
                />
              </label>

              <label class="field">
                <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.outcome') }}</span>
                <select :value="entry.id" @change="updateOutcomeId(entry, getEventValue($event))">
                  <option v-for="outcomeId in getAvailableOutcomeIds(entry.id)" :key="outcomeId" :value="outcomeId">
                    {{ t(`resourcePackCreator.moraleCheckEditor.outcomeIds.${outcomeId}`) }}
                  </option>
                </select>
              </label>
            </div>
          </article>
        </div>

        <div v-else class="empty-inline">
          {{ t('resourcePackCreator.moraleCheckEditor.emptyOutcomes') }}
        </div>
      </section>

      <section class="section-card">
        <div class="section-header">
          <h3>{{ t('resourcePackCreator.moraleCheckEditor.sections.effects') }}</h3>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.retreatDurationSeconds') }}</span>
            <input
              type="number"
              step="1"
              min="0"
              inputmode="numeric"
              :value="moraleCheck.effects.retreatDurationSeconds"
              @input="updateEffect('retreatDurationSeconds', getEventValue($event))"
            />
          </label>

          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.fleeDurationMultiplier') }}</span>
            <input
              type="number"
              step="0.1"
              min="0"
              inputmode="decimal"
              :value="moraleCheck.effects.fleeDurationMultiplier"
              @input="updateEffect('fleeDurationMultiplier', getEventValue($event))"
            />
          </label>

          <label class="field">
            <span>{{ t('resourcePackCreator.moraleCheckEditor.fields.fleeHpMultiplier') }}</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              inputmode="decimal"
              :value="moraleCheck.effects.fleeHpMultiplier"
              @input="updateEffect('fleeHpMultiplier', getEventValue($event))"
            />
          </label>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 0.9rem;
  border: 1px solid rgba(100, 116, 139, 0.36);
  border-radius: var(--radius-md);
  padding: 1rem;
  background: rgba(15, 23, 42, 0.46);
}

.panel-header h2,
.section-header h3,
.entry-header h4 {
  margin: 0;
}

.panel-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.section-grid-stacked {
  grid-template-columns: 1fr;
}

.section-card,
.entry-card {
  display: grid;
  gap: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  background: rgba(2, 6, 23, 0.32);
}

.row-list {
  display: grid;
  gap: 0.55rem;
}

.section-header {
  display: grid;
  gap: 0.15rem;
}

.section-header-row,
.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.section-header h3,
.entry-header h4 {
  font-size: 0.92rem;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.5rem;
}

.compact-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.empty-inline {
  font-size: 0.8rem;
  color: var(--text-muted);
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

.compact-btn {
  min-height: 1.55rem;
  padding: 0.18rem 0.4rem;
  font-size: 0.74rem;
  line-height: 1.1;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .section-grid,
  .compact-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .entry-header button,
  .section-header-row button {
    width: 100%;
  }
}
</style>

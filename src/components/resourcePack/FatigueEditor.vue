<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { ResourcePackDraft } from '@/components/resourcePack/types'

type FatigueDraft = NonNullable<ResourcePackDraft['fatigue']>

const fatigue = defineModel<FatigueDraft>({ required: true })
const { t } = useI18n()
const route = useRoute()
const wikiLink = computed(() => ({
  name: 'wiki',
  params: { locale: route.params.locale },
  query: { section: 'resourcepack', tab: 'fatigue' },
}))

const fields = [
  'max',
  'attackHoursPerPoint',
  'moveHoursPerPoint',
  'recoveryPerHour',
  'attackedRecoveryMultiplier',
  'damageCurvePower',
  'minDamageMultiplier',
] as const

const thresholds = computed(() => fatigue.value.speedThresholds ?? (fatigue.value.speedThresholds = []))

function updateField(key: (typeof fields)[number], raw: string) {
  const value = Number(raw)
  if (Number.isFinite(value) && value >= 0) fatigue.value[key] = value
}

function addThreshold() {
  thresholds.value.push({ moreThan: 5, multiplier: 0.8 })
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('resourcePackCreator.fatigueEditor.title') }}</h2>
        <p>{{ t('resourcePackCreator.fatigueEditor.subtitle') }}</p>
        <router-link class="wiki-link" :to="wikiLink">{{ t('wiki') }}</router-link>
      </div>
    </div>

    <div class="fields">
      <label v-for="field in fields" :key="field">
        <span>{{ t(`resourcePackCreator.fatigueEditor.fields.${field}`) }}</span>
        <input
          type="number"
          min="0"
          step="0.05"
          :value="fatigue[field] ?? ''"
          @input="updateField(field, ($event.target as HTMLInputElement).value)"
        >
      </label>
    </div>

    <div class="threshold-header">
      <h3>{{ t('resourcePackCreator.fatigueEditor.speedThresholds') }}</h3>
      <button type="button" class="secondary" @click="addThreshold">
        {{ t('resourcePackCreator.fatigueEditor.addThreshold') }}
      </button>
    </div>
    <div v-for="(threshold, index) in thresholds" :key="index" class="threshold">
      <input v-model.number="threshold.moreThan" type="number" min="0">
      <input v-model.number="threshold.multiplier" type="number" min="0" step="0.05">
      <button type="button" class="secondary danger" @click="thresholds.splice(index, 1)">×</button>
    </div>
  </section>
</template>

<style scoped>
.panel { display: grid; gap: .8rem; }
.panel-header h2, .threshold-header h3 { margin: 0; }
.panel-header p { margin: .25rem 0 0; color: var(--text-muted); }
.wiki-link { font-size: .82rem; color: var(--accent); text-decoration: none; }
.fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem; }
label { display: grid; gap: .25rem; font-size: .78rem; color: var(--text-soft); }
.threshold-header { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
.threshold { display: grid; grid-template-columns: 1fr 1fr auto; gap: .5rem; }
@media (max-width: 680px) { .fields { grid-template-columns: 1fr; } }
</style>

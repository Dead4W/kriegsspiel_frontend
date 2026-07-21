<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { getEnvMultipliers } from '@/engine/units/modifiers/UnitEnvModifiers'
import { getTimeMultipliers } from '@/engine/units/modifiers/UnitTimeModifiers'
import { getFormationMultipliers } from '@/engine/units/modifiers/UnitFormationModifiers'
import { getAbilityMultipliers } from '@/engine/units/modifiers/UnitAbilityModifiers'
import { getFormationTags, getFormationTypes } from '@/engine/resourcePack/formations'
import { getUnitFormationTypes, getUnitTypes } from '@/engine/resourcePack/units'

import type { StatKey } from '@/engine/units/baseUnit'
import {getWeatherMultipliers} from "@/engine/units/modifiers/UnitWeatherModifiers.ts";

const { t, te } = useI18n()

defineEmits(['close'])

const INVERTED_STATS: StatKey[] = ['takeDamageMod']

/* ===== helpers ===== */

function formatPercent(multiplier: number): string {
  const percent = Math.round(multiplier * 100)
  const diff = percent - 100
  return diff > 0 ? `+${diff}%` : `${diff}%`
}

function getValueClass(multiplier: number, stat: StatKey) {
  if (multiplier === 1) return 'neutral'

  const inverted = INVERTED_STATS.includes(stat)
  if (inverted) {
    return multiplier < 1 ? 'pos' : 'neg'
  }

  return multiplier > 1 ? 'pos' : 'neg'
}

function generateFromRecord(
  record: Record<string, Partial<Record<StatKey, number>>>,
  prefix: string
) {
  return Object.entries(record)
    // .filter(([, stats]) => Object.keys(stats).length > 0)
    .map(([key, stats]) => ({
      id: `${prefix}:${key}`,
      labelKey: `${prefix}.${key}`,
      rows: Object.entries(stats).map(([stat, multiplier]) => ({
        stat: stat as StatKey,
        multiplier: multiplier as number,
      })),
    }))
}

/* ===== blocks ===== */

const environmentBlocks = computed(() =>
  Object.entries(getEnvMultipliers())
    .filter(([, data]) =>
      Object.keys(data).some(k => k !== 'byTypes')
    )
    .map(([key, data]) => ({
      id: `env:${key}`,
      labelKey: `env.${key}`,
      rows: Object.entries(data)
        .filter(([k]) => k !== 'byTypes')
        .map(([stat, multiplier]) => ({
          stat: stat as StatKey,
          multiplier: multiplier as number,
        })),
    }))
)

const timeBlocks = computed(() =>
  generateFromRecord(getTimeMultipliers(), 'time')
)

const weatherBlocks = computed(() =>
  generateFromRecord(getWeatherMultipliers(), 'weather')
)

const formationBlocks = computed(() =>
  getFormationTypes().map((formation) => {
    const stats = getFormationMultipliers()[formation] ?? {}
    return {
      id: `formation:${formation}`,
      labelKey: `formation.${formation}`,
      rows: Object.entries(stats).map(([stat, multiplier]) => ({
        stat: stat as StatKey,
        multiplier: multiplier as number,
      })),
      tags: getFormationTags(formation),
      units: getUnitTypes()
        .filter((unit) => getUnitFormationTypes(unit.id).includes(formation))
        .map((unit) => te(`unit.${unit.id}`) ? t(`unit.${unit.id}`) : unit.title ?? unit.id),
    }
  })
)

const abilityBlocks = computed(() =>
  Object.entries(getAbilityMultipliers()).map(([ability, stats]) => ({
    id: `ability:${ability}`,
    labelKey: `ability.${ability}`,
    rows: Object.entries(stats).map(([stat, multiplier]) => ({
      stat: stat as StatKey,
      multiplier: multiplier as number,
    })),
    units: getUnitTypes()
      .filter((unit) => unit.abilities.includes(ability))
      .map((unit) => te(`unit.${unit.id}`) ? t(`unit.${unit.id}`) : unit.title ?? unit.id),
  }))
)

function getFormationTagLabel(tag: string): string {
  if (tag === 'cant_attack') {
    return t('tools.modifiers.formationTags.cant_attack')
  }
  return tag
}

function getFormationInfo(blockId: string) {
  return formationBlocks.value.find((block) => block.id === blockId) ?? null
}

function getAbilityInfo(blockId: string) {
  return abilityBlocks.value.find((block) => block.id === blockId) ?? null
}

function getBlockUnits(categoryId: string, blockId: string): string[] {
  if (categoryId === 'formation') return getFormationInfo(blockId)?.units ?? []
  if (categoryId === 'ability') return getAbilityInfo(blockId)?.units ?? []
  return []
}

/* ===== categories ===== */

const categories = computed(() => [
  {
    id: 'time',
    blocks: timeBlocks.value,
  },
  {
    id: 'weather',
    blocks: weatherBlocks.value,
  },
  {
    id: 'environment',
    blocks: environmentBlocks.value,
  },
  {
    id: 'formation',
    blocks: formationBlocks.value,
  },
  {
    id: 'ability',
    blocks: abilityBlocks.value,
  },
])
</script>

<template>
  <div class="help-overlay no-select">
    <div class="help-panel">
      <div class="header">
        <span>{{ t('tools.modifiers.title') }}</span>
        <button @click="$emit('close')">✖</button>
      </div>

      <div class="content">
        <section
          v-for="category in categories"
          :key="category.id"
          class="category"
        >
          <h2>{{ t(`tools.modifiers.sections.${category.id}`) }}</h2>

          <div class="blocks">
            <div
              v-for="block in category.blocks"
              :key="block.id"
              class="modifier-block"
            >
              <div class="block-title">
                <h3>{{ t(block.labelKey) }}</h3>
                <div
                  v-if="category.id === 'formation' && getFormationInfo(block.id)?.tags.length"
                  class="formation-tag-chips"
                >
                  <span
                    v-for="tag in getFormationInfo(block.id)?.tags"
                    :key="tag"
                    class="formation-tag-chip"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <table v-if="block.rows.length">
                <tr v-for="row in block.rows" :key="row.stat">
                  <td class="stat">
                    {{ t(`stat.${row.stat}`) }}
                  </td>
                  <td
                    class="value"
                    :class="getValueClass(row.multiplier, row.stat)"
                  >
                    {{ formatPercent(row.multiplier) }}
                  </td>
                </tr>
              </table>

              <div
                v-if="category.id === 'formation' || category.id === 'ability'"
                class="formation-details"
              >
                <p v-if="getFormationInfo(block.id)?.tags.length">
                  <strong>{{ t('tools.modifiers.rules') }}:</strong>
                  {{ getFormationInfo(block.id)?.tags.map(getFormationTagLabel).join(', ') }}
                </p>
                <div>
                  <strong>{{ t('tools.modifiers.availableTo') }}:</strong>
                  <div class="user-chips">
                    <span
                      v-for="unit in getBlockUnits(category.id, block.id)"
                      :key="unit"
                      class="user-chip"
                    >
                      {{ unit }}
                    </span>
                    <span v-if="!getBlockUnits(category.id, block.id).length" class="empty-value">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== overlay ===== */

.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;

  background: #020617ee;
  pointer-events: auto;

  display: flex;
  flex-direction: column;
}

/* ===== panel ===== */

.help-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== header ===== */

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: 14px 18px;
  border-bottom: 1px solid #334155;

  font-size: 18px;
  font-weight: 600;
}

.header button {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 18px;
}

/* ===== content ===== */

.content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 18px;

  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ===== category ===== */

.category h2 {
  margin: 0 0 12px;
  font-size: 16px;
  border-bottom: 1px solid #334155;
  padding-bottom: 4px;
}

/* ===== blocks ===== */

.blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

/* ===== modifier block ===== */

.modifier-block {
  width: 300px;
  background: linear-gradient(180deg, #020617ee, #020617cc);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 12px;
}

.modifier-block h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.block-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 8px;
}

.formation-tag-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.25rem;
}

.formation-tag-chip {
  padding: 0.14rem 0.38rem;
  border: 1px solid rgba(251, 191, 36, 0.45);
  border-radius: 999px;
  background: rgba(120, 53, 15, 0.25);
  color: #fde68a;
  font-size: 10px;
  line-height: 1;
}

.formation-details {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.65rem;
  font-size: 12px;
  line-height: 1.35;
}

.formation-details p {
  margin: 0.45rem 0 0;
}

.user-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}

.user-chip {
  padding: 0.16rem 0.42rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.5);
  color: #cbd5e1;
  font-size: 11px;
}

.empty-value {
  color: #94a3b8;
}

/* ===== table ===== */

.modifier-block table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.modifier-block tr:not(:last-child) td {
  border-bottom: 1px solid rgba(51, 65, 85, 0.4);
}

.modifier-block td {
  padding: 4px 0;
}

.stat {
  opacity: 0.85;
}

.value {
  text-align: right;
  font-weight: 600;
}

.value.pos { color: #22c55e; }
.value.neg { color: #ef4444; }
.value.neutral { color: #94a3b8; }

</style>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { ENV_MULTIPLIERS } from '@/engine/units/modifiers/UnitEnvModifiers'
import { TIME_MULTIPLIERS } from '@/engine/units/modifiers/UnitTimeModifiers'
import { WEATHER_MULTIPLIERS } from '@/engine/units/modifiers/UnitWeatherModifiers'
import { FORMATION_STAT_MULTIPLIERS } from '@/engine/units/modifiers/UnitFormationModifiers'
import { ABILITY_MULTIPLIERS } from '@/engine/units/modifiers/UnitAbilityModifiers'

import type { StatKey, UnitStats } from '@/engine/units/baseUnit'

const { t } = useI18n()

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
  Object.entries(ENV_MULTIPLIERS)
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
  generateFromRecord(TIME_MULTIPLIERS, 'time')
)

const weatherBlocks = computed(() =>
  generateFromRecord(WEATHER_MULTIPLIERS, 'weather')
)

const formationBlocks = computed(() =>
  Object.entries(FORMATION_STAT_MULTIPLIERS)
    .filter(([, stats]) => Object.keys(stats).length > 0)
    .map(([key, stats]) => ({
      id: `formation:${key}`,
      labelKey: `formation.${key}`,
      rows: Object.entries(stats).map(([stat, multiplier]) => ({
        stat: stat as StatKey,
        multiplier: multiplier as number,
      })),
    }))
)

const abilityBlocks = computed(() =>
  generateFromRecord(ABILITY_MULTIPLIERS, 'ability')
)

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
        <span>{{ t('tools.help.title') }}</span>
        <button @click="$emit('close')">✖</button>
      </div>

      <div class="content">
        <section
          v-for="category in categories"
          :key="category.id"
          class="category"
        >
          <h2>{{ t(`tools.help.sections.${category.id}`) }}</h2>

          <div class="blocks">
            <div
              v-for="block in category.blocks"
              :key="block.id"
              class="modifier-block"
            >
              <h3>{{ t(block.labelKey) }}</h3>

              <table>
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
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
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

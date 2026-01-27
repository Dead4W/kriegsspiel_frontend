<script setup lang="ts">
import { type uuid } from '@/engine'
import { useI18n } from 'vue-i18n'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { unsub } from '@/engine/events.ts'
import type { BattleLogEntry } from '@/engine/types/logType.ts'

import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import {
  DynamicScroller,
  DynamicScrollerItem
} from 'vue-virtual-scroller'

const { t } = useI18n()

/* =========================
   FORMULA
   ========================= */

const openedFormulas = ref<Set<string>>(new Set())

function formulaKey(logId: uuid, tokenIndex: number) {
  return `${logId}:${tokenIndex}`
}

function toggleFormula(key: string) {
  openedFormulas.value.has(key)
    ? openedFormulas.value.delete(key)
    : openedFormulas.value.add(key)
}

/* deps only for ONE log */
function formulaDeps(log: BattleLogEntry) {
  return log.tokens
    .map((_, i) => openedFormulas.value.has(formulaKey(log.id, i)))
    .join('|')
}

/* =========================
   WORLD
   ========================= */

const world = window.ROOM_WORLD

function getUnit(id: uuid) {
  return world?.units?.get(id)
}

function getUnitName(id: uuid) {
  const unit = getUnit(id)
  return unit?.label ?? id.slice(0, 6)
}

function getUnitClasses(id: uuid) {
  const classes: string[] = []
  const u = getUnit(id)

  classes.push(u?.team ?? 'UNKNOWN')
  if (u?.selected) classes.push('selected')

  return classes.join(' ')
}

/* =========================
   SELECT UNIT
   ========================= */

function selectUnit(id: uuid, e?: MouseEvent) {
  const unit = getUnit(id)
  if (!unit) return

  if (!e?.shiftKey) {
    world.units.list().forEach(u => (u.selected = false))
  }

  world.units.select(unit)
  world.events.emit?.('changed', { reason: 'unit-selected' })
}

/* =========================
   FORMATTERS
   ========================= */

function formatNumber(value: number): string {
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs < 0.0001) return value.toExponential(2)
  if (abs < 1) return value.toFixed(4)
  return value.toFixed(2)
}

function formatTime(time: string) {
  const d = new Date(time)
  if (isNaN(d.getTime())) return time

  return d.toLocaleTimeString(
    [localStorage.getItem('i18n_locale') ?? 'en'],
    { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  )
}

function timeGroupKey(time: string) {
  const d = new Date(time)
  if (isNaN(d.getTime())) return time

  return d.toLocaleTimeString(
    [localStorage.getItem('i18n_locale') ?? 'en'],
    { hour: '2-digit', minute: '2-digit', second: '2-digit' }
  )
}

/* =========================
   LOGS
   ========================= */

const selectedUnits = ref<uuid[]>([])

const logsWithHeaders = computed(() => {
  let logs = world.logs.value

  if (selectedUnits.value.length > 0) {
    logs = logs.filter(log =>
      log.tokens.some(
        t => t.t === 'unit' && selectedUnits.value.includes(t.u)
      )
    )
  }

  const result: Array<
    | { __key: string; type: 'header'; label: string }
    | { __key: string; type: 'log'; log: BattleLogEntry }
  > = []

  let lastKey: string | null = null
  let idx = 0

  for (const log of [...logs].reverse()) {
    const key = timeGroupKey(log.time)

    if (key !== lastKey) {
      result.push({
        __key: `h-${key}-${idx++}`,
        type: 'header',
        label: key,
      })
      lastKey = key
    }

    result.push({
      __key: `l-${log.id}`,
      type: 'log',
      log,
    })
  }

  return result
})

/* =========================
   SYNC SELECTED
   ========================= */

function syncTargets() {
  selectedUnits.value = world.units
    .list()
    .filter(u => u.selected)
    .map(u => u.id)
}

let unsubscribe!: unsub

onMounted(() => {
  syncTargets()
  unsubscribe = world.events.on('changed', syncTargets)
})

onUnmounted(() => {
  selectedUnits.value = []
  unsubscribe?.()
})
</script>

<template>
  <div class="battle-log-wrapper no-select">
    <DynamicScroller
      class="battle-log"
      :items="logsWithHeaders"
      key-field="__key"
      :min-item-size="24"
    >
      <template #default="{ item }">
        <!-- LOG ITEM -->
        <DynamicScrollerItem
          v-if="item.type === 'log'"
          :item="item"
          :active="true"
          :size-dependencies="[formulaDeps(item.log)]"
        >
          <div class="battle-log-entry">
            <span class="time">
              {{ formatTime(item.log.time) }}
            </span>

            <template v-for="(token, i) in item.log.tokens" :key="i">
              <span v-if="token.t === 'text'">
                {{ token.v }}
              </span>

              <span v-else-if="token.t === 'i18n'">
                {{ ` ${t(token.v)} ` }}
              </span>

              <span
                v-else-if="token.t === 'unit'"
                class="unit"
                :class="getUnitClasses(token.u).toLowerCase()"
                @click.stop="selectUnit(token.u, $event)"
              >
                {{ getUnitName(token.u) }}
              </span>

              <span v-else-if="token.t === 'number'" class="number">
                {{ formatNumber(token.v) }}
              </span>

              <span
                v-else-if="token.t === 'formula'"
                class="formula"
                @click="toggleFormula(formulaKey(item.log.id, i))"
              >
                <template v-if="openedFormulas.has(formulaKey(item.log.id, i))">
                  {{ token.v }}
                </template>
                <template v-else>
                  <span class="formula-hidden">[...]</span>
                </template>
              </span>
            </template>
          </div>
        </DynamicScrollerItem>

        <!-- HEADER ITEM -->
        <DynamicScrollerItem
          v-else
          :item="item"
          :active="true"
        >
          <div class="battle-log-header">
            {{ item.label }}
          </div>
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>
  </div>
</template>

<style scoped>
.battle-log-wrapper {
  position: absolute;
  top: 64px;
  left: 16px;
  z-index: 1000;
  pointer-events: auto;
}

.battle-log {
  width: 460px;
  height: calc(100vh - 140px);
  overflow: auto;

  background: #020617ee;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;

  font-size: 13px;
  line-height: 1.45;
}

.battle-log-header {
  margin: 8px 0 4px;
  padding: 2px 6px;

  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;

  color: #94a3b8;
  background: #020617;
  border-left: 2px solid #334155;
}

.battle-log-entry {
  padding: 4px 0;
  border-bottom: 1px solid #1e293b;
}

.time {
  color: #64748b;
  font-size: 11px;
  margin-right: 6px;
  font-family: monospace;
}

.unit {
  font-weight: 600;
  margin: 0 2px;
  cursor: pointer;
}

.unit.selected {
  text-decoration: underline;
}

.unit.red { color: #ff7474; }
.unit.blue { color: #73b2ff; }
.unit.unknown,
.unit.neutral { color: #9ca3af; }

.number {
  color: #84afaf;
}

.formula {
  font-family: monospace;
  cursor: pointer;
  color: #94a3b8;
}

.formula-hidden {
  color: #475569;
  font-style: italic;
}
</style>

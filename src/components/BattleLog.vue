<script setup lang="ts">
import {unitType, type uuid} from '@/engine'
import { useI18n } from 'vue-i18n'
import {computed, onMounted, onUnmounted, ref} from "vue";
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import type {unsub} from "@/engine/events.ts";
import type {BattleLogEntry} from "@/engine/types/logType.ts";

const { t } = useI18n()

/* FORMULA */

const openedFormulas = ref<Set<uuid>>(new Set())

function formulaKey(logId: uuid, tokenIndex: number) {
  return `${logId}:${tokenIndex}`
}

function toggleFormula(key: string) {
  if (openedFormulas.value.has(key)) {
    openedFormulas.value.delete(key)
  } else {
    openedFormulas.value.add(key)
  }
}

/* Select unit */
function selectUnit(id: uuid, e?: MouseEvent) {
  const unit = getUnit(id)
  if (!unit) return

  const multi = e?.shiftKey

  if (!multi) {
    // снять выделение со всех
    world.units.list().forEach(u => (u.selected = false))
  }

  window.ROOM_WORLD.units.select(unit)

  // если у вас есть система событий
  world.events.emit?.('changed', { reason: 'unit-selected' })
}

/* LOGS */

const logsWithHeaders = computed(() => {
  let logs = window.ROOM_WORLD.logs.value

  if (selectedUnits.value.length > 0) {
    logs = logs.filter(log =>
      log.tokens.some(
        token => token.t === 'unit' && selectedUnits.value.includes(token.u)
      )
    )
  }

  const result: Array<
    | { type: 'header'; label: string }
    | { type: 'log'; log: BattleLogEntry }
  > = []

  let lastKey: string | null = null

  for (const log of [...logs].reverse()) {
    const key = timeGroupKey(log.time)

    if (key !== lastKey) {
      result.push({
        type: 'header',
        label: key,
      })
      lastKey = key
    }

    result.push({
      type: 'log',
      log,
    })
  }

  return result
})

const selectedUnits = ref<uuid[]>([])

/* =========================
   WORLD HELPERS
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
  let classes = [];
  const u = getUnit(id);

  classes.push(u?.team ?? 'UNKNOWN')
  if (u?.selected) {
    classes.push('selected')
  }

  return classes.join(' ')
}

function formatNumber(value: number): string {
  if (value === 0) return '0'

  const abs = Math.abs(value)

  // очень маленькие числа
  if (abs < 0.0001) {
    return value.toExponential(2) // 1.23e-7
  }

  // обычные
  if (abs < 1) {
    return value.toFixed(4)
  }

  return value.toFixed(2)
}

function formatTime(time: string) {
  const d = new Date(time)

  if (isNaN(d.getTime())) {
    return time // если уже готовая строка
  }

  return d.toLocaleTimeString([localStorage.getItem('i18n_locale') ?? 'en'], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function timeGroupKey(time: string) {
  const d = new Date(time)
  if (isNaN(d.getTime())) return time

  return d.toLocaleTimeString(
    [localStorage.getItem('i18n_locale') ?? 'en'],
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  )
}


/* SYNC SELECTED */

function syncTargets() {
  selectedUnits.value = window.ROOM_WORLD.units
    .list()
    .filter(u => u.selected)
    .map(u => u.id)
}

let unsubscribe: unsub;

onMounted(() => {
  syncTargets()
  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    syncTargets()
  })
})

onUnmounted(() => {
  selectedUnits.value = [];
  unsubscribe();
})

</script>

<template>
  <div class="battle-log-wrapper no-select">
    <div class="battle-log">
      <div
        v-for="(item, idx) in logsWithHeaders"
        :key="idx"
      >
        <div
          v-if="item.type === 'header'"
          class="battle-log-header"
        >
          {{ item.label }}
        </div>

        <div
          v-else
          class="battle-log-entry"
        >
          <span class="time">
            {{ formatTime(item.log.time) }}
          </span>

          <template
            v-for="(token, i) in item.log.tokens"
            :key="i"
          >
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle-log-wrapper {
  position: absolute;
  top: 64px;
  left: 16px;
  pointer-events: auto;
  z-index: 1000;
}

.battle-log-header {
  margin: 8px 0 4px;
  padding: 2px 6px;

  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  color: #94a3b8;
  background: #020617;
  border-left: 2px solid #334155;
}

/* ===== Panel ===== */

.battle-log {
  width: 360px;
  max-height: calc(100vh - 140px);
  overflow-y: auto;

  background: #020617ee;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;

  font-size: 13px;
  line-height: 1.45;
}

/* ===== Entries ===== */

.battle-log-entry {
  padding: 4px 0;
  border-bottom: 1px solid #1e293b;
}

.battle-log-entry:last-child {
  border-bottom: none;
}

.time {
  color: #64748b;
  font-size: 11px;
  margin-right: 6px;
  font-family: monospace;
}

/* ===== Tokens ===== */

.unit {
  font-weight: 600;
  margin: 0 2px;
  cursor: pointer;
}

.unit.selected {
  text-decoration: underline;
  filter: brightness(1.2);
}

.unit:hover {
  text-decoration: underline;
  filter: brightness(1.1);
}

/* команды — имена как enum */
.unit.red {
  color: #ff7474;
}

.unit.blue {
  color: #73b2ff;
}

.unit.unknown, .unit.neutral {
  color: #9ca3af;
}

.number {
  color: #84afaf;
  font-weight: 500;
}

.formula {
  color: #94a3b8;
  font-family: monospace;
  font-size: 12px;
  cursor: pointer;
}

.formula-hidden {
  color: #475569;
  font-style: italic;
}

.formula:hover {
  color: #e5e7eb;
}
</style>

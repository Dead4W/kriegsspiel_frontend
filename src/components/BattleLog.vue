<script setup lang="ts">
import type {uuid} from '@/engine'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const logs = window.ROOM_WORLD.logs

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

function getUnitTeam(id: uuid) {
  return getUnit(id)?.team ?? 'UNKNOWN'
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
</script>

<template>
  <div class="battle-log-wrapper no-select">
    <div class="battle-log">
      <div
        v-for="log in logs"
        :key="log.id"
        class="battle-log-entry"
      >
        <template v-for="(token, i) in log.tokens" :key="i">
          <span v-if="token.t === 'text'">
            {{ token.v }}
          </span>
          <span v-if="token.t === 'i18n'"> {{ ` ${t(token.v)} ` }} </span>

          <span
            v-else-if="token.t === 'unit'"
            class="unit"
            :class="getUnitTeam(token.u)"
          >
            {{ getUnitName(token.u) }}
          </span>

          <span v-else-if="token.t === 'number'" class="number">
            {{ formatNumber(token.v) }}
          </span>

          <span v-else-if="token.t === 'formula'" class="formula">
            {{ token.v }}
          </span>
        </template>
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
}

/* ===== Panel ===== */

.battle-log {
  width: 360px;
  max-height: 260px;
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

/* ===== Tokens ===== */

.unit {
  font-weight: 600;
  margin: 0 2px;
}

/* команды — имена как enum */
.unit.red {
  color: #f87171;
}

.unit.blue {
  color: #60a5fa;
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
}
</style>

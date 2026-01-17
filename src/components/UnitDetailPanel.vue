<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {BaseUnit, StatKey} from '@/engine/units/baseUnit'
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from "vue";
import {Team} from "@/enums/teamKeys.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";
import {unitType} from "@/engine";
import {clamp} from "@/engine/math.ts";

const { unit } = defineProps<{ unit: UnwrapRef<BaseUnit> }>()

const emit = defineEmits<{
  (e: 'edit'): void
}>()

const { t } = useI18n()

const typeLabel = t(`unit.${unit.type}`)

/* Refs */

const isMessenger = ref(false);
const isStatsOpen = ref(false)

/* Logic */

const onEdit = () => {
  window.ROOM_WORLD.units.addUnitDirty(unit.id);
  emit('edit');
}

function barStyle(value: number, min: number, max: number) {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const percent = Math.round(ratio * 100)

  if (percent <= 5) {
    return { width: `${percent}%`, backgroundColor: '#ef4444' }
  }

  const r = Math.round(239 + (34 - 239) * ratio)
  const g = Math.round(68 + (197 - 68) * ratio)
  const b = Math.round(68 + (94 - 68) * ratio)

  return {
    width: `${percent}%`,
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
  }
}

function isAdmin() {
  return window.PLAYER.team === Team.ADMIN
    || window.PLAYER.team === Team.SPECTATOR
}

function percentClass(key: StatKey, p: number): string {
  if (key === 'takeDamageMod') {
    if (p < 100) return 'pos'
    if (p > 100) return 'neg'
  } else {
    if (p > 100) return 'pos'
    if (p < 100) return 'neg'
  }
  return 'aaa'
}

// PROXIES
function commitInput() {
  unit.hp = clamp(Number(hpProxy.value), 0, unit.stats.maxHp!);
  unit.ammo = clamp(Number(ammoProxy.value), 0, unit.stats.ammoMax!);
  onEdit();
}

const ammoProxy = computed({
  get() {
    refreshKey.value // Update on change refresh world
    const ammo = unit.ammo ?? 0
    return ammo % 1 === 0 ? String(ammo) : ammo.toFixed(2)
  },
  set(value) {
    const num = Number(value)

    if (Number.isNaN(num)) {
      unit.ammo = 0
      return
    }

    unit.ammo = num
  }
})

const hpProxy = computed({
  get() {
    refreshKey.value // Update on change refresh world
    const hp = unit.hp
    return hp % 1 === 0 ? String(hp) : hp.toFixed(2)
  },
  set(value) {
    const num = Number(value)
    if (Number.isNaN(num)) {
      unit.hp = 0
      return
    }
    unit.hp = num;
  }
})

function isEnabledAmmo() {
  return !!window.ROOM_SETTINGS[ROOM_SETTING_KEYS.LIMITED_AMMO]
}

// force refresh on changed
const refreshKey = ref(0)
function syncSelection(data: {reason: string}) {
  if (data.reason === 'ws') {
    return;
  }
  isMessenger.value = unit.type === unitType.MESSENGER;
  refreshKey.value++
}
onMounted(() => {
  window.ROOM_WORLD.events.on('changed', syncSelection)
  syncSelection({reason: 'init'})
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', syncSelection)
})

</script>

<template>
  <div class="detail-panel" :key="refreshKey">
    <div class="header">
      <div class="type-row">
        <span class="team-dot" :class="unit.team" />
        <span class="type-text">{{ typeLabel }}</span>
      </div>

      <input
        class="name"
        v-model="unit.label"
        :placeholder="t('stat.name')"
        @keydown.stop
        @change="onEdit"
      />
    </div>

    <div class="detail-body">
      <div class="detail-main">

        <!-- HP -->
        <div class="stat">
          <label>{{ t('stat.hp') }}</label>
          <input
            type="number"
            v-model="hpProxy"
            min="0"
            :max="unit.stats.maxHp"
            @keydown.stop
            @change="commitInput"
          />
          <span>/ {{ unit.stats.maxHp }}</span>

          <div class="bar">
            <div
              class="fill"
              :style="barStyle(unit.hp, 0, unit.stats.maxHp)"
            />
          </div>
        </div>

        <!-- MORALE -->
        <div class="stat" v-if="isAdmin()">
          <label>{{ t('stat.morale') }}</label>
          <input
            type="number"
            v-model="unit.morale"
            @keydown.stop
            @change="onEdit"
          />
        </div>

        <!-- TOGGLE STATS -->
        <div class="stats-toggle" @click="isStatsOpen = !isStatsOpen">
          <span>{{ t('stat.details') }}</span>
          <span class="arrow" :class="{ open: isStatsOpen }">▾</span>
        </div>

        <template v-if="isStatsOpen">
          <!-- Messages -->
          <template v-if="isMessenger">
            <hr>
            <div v-for="m of unit.messages" class="stat-mod">
              <div class="stat-value">
                <span class="final">
                  {{ m.author }}
                </span>
                <span class="origin">
                  {{ m.time }}
                </span>
              </div>
              <div class="stat-value">
                <span class="origin">
                  {{ m.text }}
                </span>
              </div>
            </div>
          </template>

          <template v-if="unit.type !== unitType.MESSENGER">
            <!-- Ammo -->
            <div v-if="isEnabledAmmo() && unit.stats.ammoMax != null" class="stat">
              <label>{{ t('stat.ammo') }}</label>
              <input
                type="number"
                v-model="ammoProxy"
                min="0"
                :max="unit.stats.ammoMax"
                @keydown.stop
                @change="commitInput"
              />
              <span>/ {{ unit.stats.ammoMax }}</span>

              <div class="bar ammo">
                <div
                  class="fill"
                  :style="barStyle(unit.ammo ?? 0, 0, unit.stats.ammoMax)"
                />
              </div>
            </div>

            <!-- Readonly stats -->
            <div
              v-for="statKey in ['damage','speed','takeDamageMod','attackRange','visionRange']"
              :key="statKey"
              class="stat-mod"
            >
              <label>{{ t(`stat.${statKey}`) }}</label>

              <!-- main stat text -->
              <div class="stat-value">
            <span class="final" v-if="statKey === 'takeDamageMod' || statKey === 'damage'">
              {{ unit[statKey].toFixed(2) }}
            </span>
                <span class="final" v-else>
              {{ Math.round(unit[statKey as StatKey]) }}
            </span>

                <span
                  v-if="unit.getStatModifierInfo(statKey as StatKey).percent !== 100"
                  class="origin"
                  :class="percentClass(statKey as StatKey, unit.getStatModifierInfo(statKey as StatKey).percent)"
                >
              (
              {{ Math.round(unit.stats[statKey as StatKey]) }}
              *
              {{ unit.getStatModifierInfo(statKey as StatKey).percent }}%
              )
            </span>
              </div>

              <!-- modifier cards -->
              <div
                v-if="unit.getStatModifierInfo(statKey as StatKey).sources.length"
                class="modifier-cards"
              >
                <div
                  v-for="m in unit.getStatModifierInfo(statKey as StatKey).sources"
                  :key="m.state"
                  class="modifier-card"
                  :class="percentClass(statKey as StatKey, Math.round((m.multiplier) * 100))"
                >
                  <span class="env" v-if="m.type === 'env'">
                    {{ t(`env.${m.state}`) }}
                  </span>
                  <span class="env" v-if="m.type === 'formation'">
                    {{ t(`formation.${m.state}`) }}
                  </span>
                  <span class="env" v-if="m.type === 'ability'">
                    {{ t(`ability.${m.state}`) }}
                  </span>
                  <span class="percent">
                    {{ Math.round((m.multiplier) * 100) }}%
                  </span>
                </div>
              </div>
            </div>

            <template v-if="isAdmin()">
              <div
                class="stat-mod"
              >
                <label>{{ t(`stat.height`) }}</label>

                <!-- main stat text -->
                <div class="stat-value">
            <span class="final">
              {{ Math.round(unit.height) }}m
            </span>
                </div>
              </div>
            </template>
          </template>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-panel {
  overflow-y: auto;
  margin: 0 auto;
  width: 400px;
  padding: 12px;
  background: #020617ee;
  border: 1px solid #334155;
  border-radius: 0 12px 12px 0;
  color: white;
  pointer-events: auto;
}

.header {
  margin-bottom: 8px;
}

.type-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-text {
  font-size: 11px;
  color: #94a3b8;
}

.name {
  width: 100%;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: white;
}

.detail-body {
  display: flex;
  gap: 12px;
}

.detail-main {
  flex: 1;
  min-width: 0;
}

.stat {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  min-height: 20px;
}

.stat-mod {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
  min-height: 20px;
}

.stat-mod label {
  width: 90px;
}

.stat-mod .final {
  width: 50px;
}

.stat label {
  width: 90px;
  color: #94a3b8;
}

.stat input {
  width: 60px;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 4px;
  color: white;
  padding: 2px 4px;
}

/* ===== stat value ===== */

.stat-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 110px;
}

.stat-value .final {
  font-weight: 600;
}

.stat-value .origin {
  font-size: 11px;
  opacity: 0.9;
}

.stat-value .origin.pos {
  color: #86efac;
}

.stat-value .origin.neg {
  color: #fca5a5;
}

/* ===== modifier cards ===== */

.modifier-cards {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.modifier-card {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  background: #020617;
  border: 1px solid #334155;
  min-width: 92px;
}

.modifier-card.pos {
  border-color: #14532d;
  color: #86efac;
}

.modifier-card.neg {
  border-color: #7f1d1d;
  color: #fca5a5;
}

.modifier-card .env {
  opacity: 0.85;
}

.modifier-card .percent {
  font-weight: 600;
}

/* ===== bars ===== */

.bar {
  flex: 1;
  height: 6px;
  background: #1e293b;
  border-radius: 4px;
  overflow: hidden;
}

.bar.ammo .fill {
  background: #3b82f6;
}

.fill {
  height: 100%;
  background: #22c55e;
}

/* ===== team dot ===== */

.team-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.team-dot.red { background: #ef4444 }
.team-dot.blue { background: #3b82f6 }
.team-dot.neutral { background: #94a3b8 }

.stats-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 11px;
  color: #94a3b8;
  margin: 6px 0 8px;
  user-select: none;
}

.stats-toggle:hover {
  color: white;
}

.stats-toggle .arrow {
  transition: transform 0.2s ease;
}

.stats-toggle .arrow.open {
  transform: rotate(180deg);
}

</style>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {Team} from '@/enums/teamKeys'
import {RoomGameStage} from "@/enums/roomStage.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";
import type {unitTeam} from "@/engine";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys";
import type {TimeOfDay} from "@/engine/units/modifiers/UnitTimeModifiers.ts";
import {useI18n} from 'vue-i18n'
import {AttackCommand} from "@/engine/units/commands/attackCommand.ts";

const { t } = useI18n()

const displayWorldTime = ref<string>(window.ROOM_WORLD.time)
const timeOfDay = ref<TimeOfDay>(window.ROOM_WORLD.getTimeOfDay())
const weather = window.ROOM_WORLD.weather

const minutes = ref(1)
const seconds = ref(0)

const totalSeconds = ref(0)
const running = ref(false)

/* ===== helpers ===== */

const displayTurnTime = computed(() => {
  const m = Math.floor(totalSeconds.value / 60)
  const s = totalSeconds.value % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

function isAdmin() {
  return window.PLAYER?.team === Team.ADMIN
}

function isWar() {
  return window.ROOM_WORLD.stage === RoomGameStage.WAR;
}

function isEnabledTimeModifiers() {
  return !!window.ROOM_SETTINGS[ROOM_SETTING_KEYS.TIME_MODIFIERS]
}

function isEnabledWeatherModifiers() {
  return !!window.ROOM_SETTINGS[ROOM_SETTING_KEYS.WEATHER_MODIFIERS]
}

function onWheelNumber(
  e: WheelEvent,
  timeType: 'seconds' | 'minutes',
  min = -Infinity,
  max = Infinity
) {
  e.preventDefault()

  const delta = e.deltaY < 0 ? 1 : -1
  if (timeType === 'seconds') {
    seconds.value += delta
    seconds.value = Math.min(max, Math.max(min, seconds.value))
  } else if (timeType === 'minutes') {
    minutes.value += delta
    minutes.value = Math.min(max, Math.max(min, minutes.value))
  }
}

/* ===== Commands ==== */

function processUnitCommands(dt: number) {
  const units = window.ROOM_WORLD.units.list()

  for (const unit of units) {
    if (!unit.alive) continue
    unit.isTimeout = false;

    let commands = unit.getCommands()
    if (unit.autoAttack) {
      const directEnemyVision = window.ROOM_WORLD.units.getDirectView(unit)
        .filter(u => u.team !== unit.team)

      commands = commands.filter(c => c.type !== UnitCommandTypes.Attack)
      const attackCommand = new AttackCommand({
        targets: directEnemyVision.map(u => u.id),
        damageModifier: 1,
        abilities: [],
        inaccuracyPoint: null
      })
      commands.push(attackCommand)
    }
    if (commands.length === 0) continue;

    let left_dt = dt;

    const goodCommands = [];
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!

      if (cmd.isFinished(unit)) {
        continue;
      }

      if ([UnitCommandTypes.Attack, UnitCommandTypes.Retreat].includes(cmd.type)) {
        cmd.start(unit)
        cmd.update(unit, dt)
      } else {
        if (left_dt > 0) {
          const estimate = cmd.estimate(unit);
          cmd.start(unit)
          if (estimate > left_dt) {
            cmd.update(unit, left_dt)
            left_dt = 0
          } else {
            cmd.update(unit, estimate)
            left_dt -= estimate;
          }
        } else {
          goodCommands.push(cmd)
          continue
        }
      }

      if (!cmd.isFinished(unit)) {
        goodCommands.push(cmd);
      }
    }

    // если список изменился — синхронизируем
    unit.setCommands(goodCommands)
    unit.setDirty()
  }
}

/* ===== timer ===== */

async function startTurn() {
  const value = minutes.value * 60 + seconds.value
  if (value <= 0 || running.value) return

  totalSeconds.value = value
  running.value = true

  const MAX_STEP = 60 // cекунд

  window.ROOM_WORLD.units.withNewCommandsTmp.clear()
  window.ROOM_WORLD.socketLock = true
  let runningSteps = 0

  while (totalSeconds.value > 0 && running.value) {
    if (!running.value) return;
    const step = Math.min(MAX_STEP, totalSeconds.value)
    processUnitCommands(step)

    totalSeconds.value -= step

    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });

    runningSteps++

    window.ROOM_WORLD.skipTime(step, false)
    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()

    if (runningSteps % 10 === 0) {
      // отдаём управление браузеру
      await new Promise(requestAnimationFrame)
    }
  }

  window.ROOM_WORLD.events.emit('changed', { reason: 'timer' });

  // DirectView general
  if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.GENERAL_VISION_UPDATE]) {
    const directViewByTeam = window.ROOM_WORLD.units.getDirectViewByGenerals();
    for (const team of [Team.RED, Team.BLUE]) {
      window.ROOM_WORLD.events.emit('api', {type: 'direct_view', team: team, data: directViewByTeam.get(team as unitTeam)!.map(uuid => {
          const u = window.ROOM_WORLD.units.get(uuid)!
          return {
            id: u.id,
            type: u.type,
            team: u.team,
            pos: u.pos,

            isTimeout: u.isTimeout,

            hp: u.hp,
            ammo: u.ammo,

            envState: u.envState,
            formation: u.getFormation(),
            activeAbilityType: u.activeAbilityType,
          }
        })})
    }
  }

  if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.WEATHER_MODIFIERS]) {
    window.ROOM_WORLD.events.emit('api', {type: 'weather', data: window.ROOM_WORLD.newWeather.value});
    window.ROOM_WORLD.weather.value = window.ROOM_WORLD.newWeather.value;
  }

  // units with new commands
  for (const unitId of window.ROOM_WORLD.units.withNewCommandsTmp) {
    window.ROOM_WORLD.units.withNewCommands.add(unitId)
  }

  // ВСЕГДА В КОНЦЕ
  window.ROOM_WORLD.skipTime(0)
  window.ROOM_WORLD.socketLock = false

  running.value = false
  displayWorldTime.value = window.ROOM_WORLD.time
  timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()
}

function stopTurn() {
  running.value = false
}

// LIFE CYCLE


// force refresh on changed
const refreshKey = ref(0)
function sync(data: {reason: string}) {
  debugPerformance('TurnTimer.sync', () => {
    if (['camera', 'drag'].includes(data.reason)) return;
    refreshKey.value++
    displayWorldTime.value = window.ROOM_WORLD.time
    timeOfDay.value = window.ROOM_WORLD.getTimeOfDay()
  })
}

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
  sync({ reason: "init" })
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})
</script>

<template>
  <div class="turn-timer" :key="refreshKey">
    <div class="world-time">
      {{ displayWorldTime }}
    </div>

    <div class="turn-row">
      <div v-if="isAdmin() && isWar()" class="admin-controls">
        <div class="turn-time">
          ⏱ {{ displayTurnTime }}
        </div>

        <input
          type="number"
          min="0"
          v-model.number="minutes"
          @wheel="e => onWheelNumber(e, 'minutes', 0)"
        />
        <span>:</span>
        <input
          type="number"
          min="0"
          max="59"
          v-model.number="seconds"
          @wheel="e => onWheelNumber(e, 'seconds', 0)"
        />

        <button @pointerdown="startTurn" :class="{disabled: running}">
          ▶
        </button>
      </div>
    </div>

    <div class="world-time-state">
      <span class="label" v-if="isEnabledTimeModifiers()">
        {{ t(`time.${timeOfDay}`) }}
      </span>
      <span class="separator" v-if="isEnabledTimeModifiers() && isEnabledWeatherModifiers()">
        •
      </span>
      <span class="label" v-if="isEnabledWeatherModifiers()">
        {{ t(`weather.${weather}`) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.turn-timer {
  width: 220px;
  text-align: center;

  background: #020617cc;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 6px 12px;

  color: white;
  font-size: 13px;

  display: flex;
  flex-direction: column;
  gap: 4px;

  pointer-events: auto;
}


.world-time {
  text-align: center;
  font-size: 20px;
  opacity: 0.85;
}

.turn-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.turn-time {
  font-size: 16px;
  font-weight: 600;
  min-width: 56px;
}

.admin-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.admin-controls input {
  width: 50px;
  padding: 2px 4px;
  text-align: center;

  background: #020617;
  border: 1px solid #334155;
  color: white;
  border-radius: 6px;
}

.admin-controls button {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.admin-controls button:disabled {
  background: #020617;
  border-color: #334155;
  color: #64748b;

  cursor: not-allowed;
  opacity: 0.6;
}

button.disabled {
  background: #020617;
  border-color: #334155;
  color: #64748b;
  cursor: not-allowed;
  opacity: 0.6;
}

.world-time-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  font-size: 11px;
  opacity: 0.75;

  white-space: nowrap;
}

.world-time-state .icon {
  font-size: 14px;
}

.world-time-state .label {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-time-state .separator {
  opacity: 0.4;
  margin: 0 2px;
}

</style>

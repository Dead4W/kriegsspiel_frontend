<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {Team} from '@/enums/teamKeys'
import {RoomGameStage} from "@/enums/roomStage.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {MoveCommand} from "@/engine/units/commands/moveCommand.ts";
import {debugPerformance} from "@/engine/debugPerformance.ts";

const { t } = useI18n()

const displayWorldTime = ref(window.ROOM_WORLD.time)

const minutes = ref(5)
const seconds = ref(0)

const totalSeconds = ref(0)
const running = ref(false)

let timerId: number | null = null

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

/* ===== Commands ==== */

function processUnitCommands(dt: number) {
  const units = window.ROOM_WORLD.units.list()

  for (const unit of units) {
    const commands = unit.getCommands()
    if (commands.length === 0) continue;

    let left_dt = dt;

    const goodCommands = [];
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i]!

      if (cmd.isFinished(unit)) {
        continue;
      }

      if (cmd.type === UnitCommandTypes.Attack) {
        cmd.start(unit)
        cmd.update(unit, left_dt)
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

  const MAX_STEP = 5 * 60 // 300 секунд

  window.ROOM_WORLD.units.withNewCommandsTmp.clear()
  window.ROOM_WORLD.socketLock = true

  while (totalSeconds.value > 0 && running.value) {
    if (!running.value) return;
    const step = Math.min(MAX_STEP, totalSeconds.value)
    processUnitCommands(step)

    totalSeconds.value -= step

    window.ROOM_WORLD.events.emit('changed', { reason: 'unit' });

    // отдаём управление браузеру
    await new Promise(requestAnimationFrame)
  }

  window.ROOM_WORLD.events.emit('changed', { reason: 'timer' });

  running.value = false
  displayWorldTime.value = window.ROOM_WORLD.time

  // DirectView general
  const directViewByTeam = window.ROOM_WORLD.units.getDirectView();
  for (const team of [Team.RED, Team.BLUE]) {
    window.ROOM_WORLD.events.emit('api', {type: 'direct_view', team: team, data: directViewByTeam.get(team)!.map(uuid => {
        const u = window.ROOM_WORLD.units.get(uuid)!
        return {
          id: u.id,
          pos: u.pos,
          hp: u.hp,
        }
    })})
  }

  // units with new commands
  for (const unitId of window.ROOM_WORLD.units.withNewCommandsTmp) {
    window.ROOM_WORLD.units.withNewCommands.add(unitId)
  }

  // ВСЕГДА В КОНЦЕ
  window.ROOM_WORLD.skipTime(value)
  window.ROOM_WORLD.socketLock = false
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

        <input type="number" min="0" v-model.number="minutes" />
        <span>:</span>
        <input type="number" min="0" max="59" v-model.number="seconds" />

        <button @click="startTurn" :disabled="running">
          ▶
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.turn-timer {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);

  pointer-events: auto;
  z-index: 20;

  background: #020617cc;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 6px 12px;

  color: white;
  font-size: 13px;

  display: flex;
  flex-direction: column;
  gap: 4px;
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

</style>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {BaseUnit} from '@/engine/units/baseUnit'
import {BaseCommand, CommandStatus} from '@/engine/units/commands/baseCommand'
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {AttackCommand, type AttackCommandState} from "@/engine/units/commands/attackCommand.ts";
import {MoveCommand} from "@/engine/units/commands/moveCommand.ts";
import type {vec2} from "@/engine";
import type {RetreatCommandState} from "@/engine/units/commands/retreatCommand.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import {
  UnitEnvironmentState,
  UnitEnvironmentStateIcon,
} from "@/engine/units/enums/UnitStates.ts";

const { unit } = defineProps<{ unit: BaseUnit }>()
const { t } = useI18n()

const commands = computed(() => {
  refreshKey.value;
  return unit.getCommands() ?? []
})

const commandsEstimates = computed(() => {
  let lastPos: vec2 = unit.pos
  const result: Record<number, number> = {}
  for (const cmdIndex in commands.value) {
    const cmd = commands.value[cmdIndex]!
    let est = 0
    if (cmd instanceof MoveCommand) {
      est = cmd.estimate(unit, lastPos)
      lastPos = cmd.getState().state.target
    } else {
      est = cmd.estimate(unit)
    }
    if (est > 0 && Number.isFinite(est)) {
      result[cmdIndex] = est
    }
  }
  return result
})

const totalEstimate = computed(() => {
  return Object.values(commandsEstimates.value)
    .reduce((a, b) => a + b, 0)
})

function cmdKey(cmd: BaseCommand<any, any>) {
  const { type, state } = cmd.getState()
  return JSON.stringify({ type, state })
}

function remove(cmd: BaseCommand<any, any>) {
  const key = cmdKey(cmd)
  const list = unit.getCommands() ?? []
  const next = list.filter(c => cmdKey(c) !== key)
  unit.setCommands(next)
}

function distPx(a: vec2, b: vec2) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function fmtMeters(meters: number) {
  return `${Math.round(meters)} m`
}

function moveStartPosForIndex(cmdIndex: number): vec2 {
  // "start" for this move = unit current pos + previous move targets in queue
  let p: vec2 = unit.pos
  for (let i = 0; i < cmdIndex; i++) {
    const c = commands.value[i]
    if (c instanceof MoveCommand) {
      p = c.getState().state.target
    }
  }
  return p
}

function moveDistanceMetersFor(cmd: BaseCommand<any, any>, cmdIndex: number): number | null {
  if (!(cmd instanceof MoveCommand)) return null
  const start = moveStartPosForIndex(cmdIndex)
  const end = cmd.getState().state.target
  const mpp = window.ROOM_WORLD?.map?.metersPerPixel ?? 1
  return distPx(start, end) * mpp
}

function moveModifier(cmd: BaseCommand<any, any>): UnitEnvironmentState | null {
  if (!(cmd instanceof MoveCommand)) return null
  return cmd.getState().state.modifier ?? null
}

function envIcon(state: UnitEnvironmentState) {
  return UnitEnvironmentStateIcon[state]
}

function description(cmd: BaseCommand<any, any>, cmdIndex: number) {
  const { type, state } = cmd.getState()

  switch (type) {
    case UnitCommandTypes.Move:
      return t('command_desc.move', {
        dist: fmtMeters(moveDistanceMetersFor(cmd, cmdIndex) ?? 0),
      })

    case UnitCommandTypes.Attack:
      const attackState = state as AttackCommandState
      const attackCmd = cmd as AttackCommand
      let targets = attackState.targets.length;
      if (attackState.inaccuracyPoint) {
        const inaccuracyRadius = computeInaccuracyRadius(unit, attackState.inaccuracyPoint)
        targets = attackCmd.getUnitsInInaccuracyRadius(inaccuracyRadius, unit).length;
      }
      return t('command_desc.attack', {
        count: targets,
        dmg: state.damageModifier.toFixed(2),
      })

    case UnitCommandTypes.ChangeFormation:
      return t('command_desc.changeFormation', {
        formation: t(`formation.${state.newFormation}`),
      })

    case UnitCommandTypes.Wait:
      return cmd.getState().state.comment

    case UnitCommandTypes.Retreat: {
      return t('command_desc.retreat', {
        action: cmd.getState().state.comment ?? '',
      })
    }

    default:
      return ''
  }
}

function statusClass(status: CommandStatus) {
  return status
}

function estimate(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''

  const total = Math.ceil(seconds)

  if (total < 60) {
    return t('time.seconds', { count: total })
  }

  const minutes = Math.floor(total / 60)
  const restSeconds = total % 60

  if (restSeconds === 0) {
    return t('time.minutes', { count: minutes })
  }

  return t('time.minutes_seconds', {
    minutes,
    seconds: restSeconds,
  })
}

const refreshKey = ref(0);

function sync(data: { reason: string }) {
  if (data.reason !== 'timer') return;
  refreshKey.value++
}

function getUnitCommandAbility(cmd: BaseCommand<any, any>, unit: BaseUnit): UnitAbilityType | null {
  if (
    !(cmd instanceof MoveCommand)
    && !(cmd instanceof AttackCommand)
  ) {
    return null
  }

  const abilities = cmd.getState().state.abilities

  for (const ability of abilities) {
    if (unit.abilities.includes(ability)) {
      return ability
    }
  }
  return null
}

/* LIFE CYCLE */

onMounted(() => {
  window.ROOM_WORLD.events.on('changed', sync)
})
onUnmounted(() => {
  window.ROOM_WORLD.events.off('changed', sync)
})

</script>

<template>
  <div class="commands-panel" :key="`commands_panel_${refreshKey}`">
    <div class="header">
      {{ t('tools.commands') }} {{ estimate(totalEstimate) }}
    </div>

    <div class="list">
      <div
        v-for="(cmd, i) in commands"
        :key="i"
        class="command"
        :class="statusClass(cmd.status)"
      >
        <div class="top">
          <span class="type">
            {{ t(`command.${cmd.type}`) }}
          </span>

          <button
            class="remove"
            :title="t('tools.command_remove')"
            @click.stop="remove(cmd)"
          >
            ✕
          </button>
        </div>

        <div class="desc">
          <span>{{ description(cmd, i) }}</span>
          <span
            v-if="moveModifier(cmd)"
            class="modifier-icon"
            :title="t(`env.${moveModifier(cmd)}`)"
          >
            {{ envIcon(moveModifier(cmd)!) }}
          </span>
        </div>

        <div class="ability" v-if="getUnitCommandAbility(cmd, unit)">
          {{ t('command.ability') }}: {{ t(`ability.${getUnitCommandAbility(cmd, unit)}`) }}
        </div>

        <div
          class="estimate"
          v-if="commandsEstimates[i]"
        >
          {{ estimate(commandsEstimates[i]) }}
        </div>

        <div class="status">
          {{ t(`command_status.${cmd.status}`) }}
        </div>
      </div>
    </div>
  </div>
</template>


<style scoped>
.commands-panel {
  overflow-y: auto;
  width: 240px;
  background: #020617ee;
  border: 1px solid #334155;
  border-right: none;
  border-radius: 12px 0 0 12px;
  padding: 8px;
  font-size: 11px;
  color: white;
  display: flex;
  flex-direction: column;
}

.header {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 6px;
}

.list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.command {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px;
}

.command.running {
  border-color: var(--accent);
}

.command.completed {
  opacity: 0.5;
}

.command.cancelled {
  opacity: 0.4;
  text-decoration: line-through;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.type {
  font-weight: 600;
}

.remove {
  background: none;
  border: none;
  color: #fca5a5;
  cursor: pointer;
}

.desc {
  font-size: 10px;
  color: #cbd5f5;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.modifier-icon {
  font-size: 12px;
  line-height: 1;
  opacity: 0.9;
}

.ability {
  color: #d5d5d5;
}

.status {
  font-size: 9px;
  color: #94a3b8;
  margin-top: 2px;
}

</style>

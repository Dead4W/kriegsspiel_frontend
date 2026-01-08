<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'
import {BaseCommand, CommandStatus} from '@/engine/units/commands/baseCommand'
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";

const { unit } = defineProps<{ unit: BaseUnit }>()
const { t } = useI18n()

const commands = computed(() => unit.getCommands() ?? [])

function cmdKey(cmd: BaseCommand<any, any>) {
  const { type, state } = cmd.getState()
  // важно: выбирай только стабильные поля
  return JSON.stringify({ type, state })
}

function remove(cmd: BaseCommand<any, any>) {
  const key = cmdKey(cmd)
  const list = unit.getCommands() ?? []
  const next = list.filter(c => cmdKey(c) !== key)
  unit.setCommands(next)
}

function description(cmd: BaseCommand<any, any>) {
  const { type, state } = cmd.getState()

  switch (type) {
    case UnitCommandTypes.Move:
      return t('command_desc.move', {
        x: Math.round(state.target.x),
        y: Math.round(state.target.y),
      })

    case UnitCommandTypes.Attack:
      return t('command_desc.attack', {
        count: state.targets.length,
        dmg: Math.round((state.damageModifier - 1) * 100),
      })

    case UnitCommandTypes.AbilityAttack:
      return t('command_desc.abilityAttack', {
        ability: state.abilityId,
        count: state.targets.length,
        dmg: Math.round((state.damageModifier - 1) * 100),
      })

    case UnitCommandTypes.ChangeFormation:
      return t('command_desc.changeFormation', {
        formation: t(`formation.${state.newFormation}`),
      })

    default:
      return ''
  }
}

function statusClass(status: CommandStatus) {
  return status
}
</script>

<template>
  <div class="commands-panel">
    <div class="header">
      {{ t('tools.commands') }}
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
          {{ description(cmd) }}
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
}

.status {
  font-size: 9px;
  color: #94a3b8;
  margin-top: 2px;
}

</style>

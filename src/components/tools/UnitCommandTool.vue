<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'

import CommandAttack from './commands/CommandAttack.vue'
import CommandMove from "@/components/tools/commands/CommandMove.vue";
import {unitType} from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import CommandDelivery from "@/components/tools/commands/CommandDelivery.vue";
import CommandChangeFormation from "@/components/tools/commands/CommandChangeFormation.vue";
import CommandWait from "@/components/tools/commands/CommandWait.vue";

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'edit'): void
}>()

const { t } = useI18n()

const activeOrder = ref<UnitCommandTypes | null>(null)

function open(order: UnitCommandTypes) {
  activeOrder.value = order
}

function close() {
  activeOrder.value = null
  emit('edit')
}

function isMessenger() {
  return props.units.filter(u => u.type === unitType.MESSENGER).length === props.units.length;
}

function clearCommands() {
  for (const u of props.units) {
    u.clearCommands()
    u.setDirty()
  }
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
}

</script>

<template>
  <div class="orders-root">

    <!-- ===== BUTTONS ===== -->
    <div v-if="!activeOrder" class="orders-buttons">
      <button class="order-btn attack" @click="open(UnitCommandTypes.Attack)" v-if="!isMessenger()">
        <span class="icon">⚔</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.attack') }}</span>
      </button>

      <button class="order-btn" @click="open(UnitCommandTypes.Move)">
        <span class="icon">🚶</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.move') }}</span>
      </button>

      <button class="order-btn" @click="open(UnitCommandTypes.Delivery)" v-if="isMessenger()">
        <span class="icon">✉️</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.delivery') }}</span>
      </button>

      <button class="order-btn" @click="open(UnitCommandTypes.ChangeFormation)" v-if="!isMessenger()">
        <span class="icon icon-formation">■■■</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.formation') }}</span>
      </button>

      <button class="order-btn" @click="open(UnitCommandTypes.Wait)">
        <span class="icon">⏳</span>
        <span class="label">
          {{ t('tools.command.command') }}<br>
          {{ t('tools.command.wait') }}
        </span>
      </button>

      <button class="order-btn" @click="clearCommands">
        <span class="icon icon-formation">❌</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.clear_commands') }}</span>
      </button>
    </div>

    <!-- ===== DETAILS ===== -->
    <CommandAttack
      v-if="activeOrder === UnitCommandTypes.Attack"
      :units="units"
      @close="close"
    />

    <CommandMove
      v-if="activeOrder === UnitCommandTypes.Move"
      :units="units"
      @close="close"
    />

    <CommandDelivery
      v-if="activeOrder === UnitCommandTypes.Delivery"
      :units="units"
      @close="close"
    />

    <CommandChangeFormation
      v-if="activeOrder === UnitCommandTypes.ChangeFormation"
      :units="units"
      @close="close"
    />

    <CommandWait
      v-if="activeOrder === UnitCommandTypes.Wait"
      :units="units"
      @close="close"
    />
  </div>
</template>

<style scoped>
.orders-root {
  pointer-events: auto;
  flex: 1;
  display: flex;
  flex-grow: 0;
}

.orders-buttons {
  display: flex;
  gap: 6px;
  height: 100%;
}

.order-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 60px;

  padding: 6px;
  border-radius: 8px;
  border: 1px solid #334155;
  //background: linear-gradient(180deg, #020617, #020617cc);
  background: #020617;
  color: #e5e7eb;

  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.08s ease,
    border-color 0.15s ease;
}

.order-btn:hover {
  background: #020617;
  border-color: #475569;
}

.order-btn:active {
  transform: translateY(1px);
}

.order-btn .icon {
  font-size: 18px;
  line-height: 1;
}

.icon.icon-formation {
  color: #c3c3c3;
}

.order-btn .label {
  font-size: 10px;
  text-align: center;
  opacity: 0.9;
}

/* Акцент атаки */
.order-btn.attack {
  color: #f87171;
  border-color: #7f1d1d;
}

.order-btn.attack:hover {
  border-color: #ef4444;
}

</style>

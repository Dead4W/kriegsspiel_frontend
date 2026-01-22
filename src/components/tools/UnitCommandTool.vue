<script setup lang="ts">
import {onMounted, onUnmounted, ref} from 'vue'
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

const hotkeys: Record<string, UnitCommandTypes> = {
  '1': UnitCommandTypes.Attack,
  '2': UnitCommandTypes.Move,
  '3': UnitCommandTypes.ChangeFormation,
  '4': UnitCommandTypes.Wait,
  '5': UnitCommandTypes.Delivery,
}

const activeOrder = ref<UnitCommandTypes | null>(null)

const attackRef = ref<any>(null)
const moveRef = ref<any>(null)
const formationRef = ref<any>(null)
const waitRef = ref<any>(null)
const deliveryRef = ref<any>(null)

function open(order: UnitCommandTypes) {
  if (isCommandDisabled(order)) return
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

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && activeOrder.value) {
    e.preventDefault()
    e.stopPropagation()

    switch (activeOrder.value) {
      case UnitCommandTypes.Attack:
        attackRef.value?.confirm?.()
        break
      case UnitCommandTypes.Move:
        moveRef.value?.confirm?.()
        break
      case UnitCommandTypes.ChangeFormation:
        formationRef.value?.confirm?.()
        break
      case UnitCommandTypes.Wait:
        waitRef.value?.confirm?.()
        break
      case UnitCommandTypes.Delivery:
        deliveryRef.value?.confirm?.()
        break
    }
    return
  }

  if (e.key === 'Escape') {
    if (activeOrder.value) {
      close()
      e.preventDefault()
      e.stopPropagation()
    }
    return
  }

  // если уже открыта команда — не перехватываем
  if (activeOrder.value) return

  const command = hotkeys[e.key]
  if (!command) return

  // условия доступности
  if (command === UnitCommandTypes.Attack && isMessenger()) return
  if (command === UnitCommandTypes.ChangeFormation && isMessenger()) return
  if (command === UnitCommandTypes.Delivery && !isMessenger()) return

  open(command)
}

function getHotkey(command: UnitCommandTypes): string | null {
  for (const [key, value] of Object.entries(hotkeys)) {
    if (value === command) return key
  }
  return null
}

function hotkeyTitle(command: UnitCommandTypes) {
  const key = getHotkey(command)
  return key ? `${t('hotkey')}: ${key}` : ''
}

function isCommandDisabled(command: UnitCommandTypes): boolean {
  if (!props.units.length) return true

  if (command === UnitCommandTypes.Attack && isMessenger()) return true
  if (command === UnitCommandTypes.ChangeFormation && isMessenger()) return true
  if (command === UnitCommandTypes.Delivery && !isMessenger()) return true

  return false
}

// LIFE CYCLE

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

</script>

<template>
  <div class="orders-root">

    <!-- ===== BUTTONS ===== -->
    <div v-if="!activeOrder" class="orders-buttons">
      <button
        class="order-btn attack"
        @click="open(UnitCommandTypes.Attack)"
        :disabled="isCommandDisabled(UnitCommandTypes.Attack)"
        :title="hotkeyTitle(UnitCommandTypes.Attack)"
      >
        <span class="icon">⚔</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.attack') }}</span>
      </button>

      <button
        class="order-btn"
        @click="open(UnitCommandTypes.Move)"
        :disabled="isCommandDisabled(UnitCommandTypes.Move)"
        :title="hotkeyTitle(UnitCommandTypes.Move)"
      >
        <span class="icon">🚶</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.move') }}</span>
      </button>

      <button
        class="order-btn"
        @click="open(UnitCommandTypes.ChangeFormation)"
        :disabled="isCommandDisabled(UnitCommandTypes.ChangeFormation)"
        :title="hotkeyTitle(UnitCommandTypes.ChangeFormation)"
      >
        <span class="icon icon-formation">■■■</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.formation') }}</span>
      </button>

      <button
        class="order-btn"
        @click="open(UnitCommandTypes.Wait)"
        :disabled="isCommandDisabled(UnitCommandTypes.Wait)"
        :title="hotkeyTitle(UnitCommandTypes.Wait)"
      >
        <span class="icon">⏳</span>
        <span class="label">
          {{ t('tools.command.command') }}<br>
          {{ t('tools.command.wait') }}
        </span>
      </button>

      <button
        class="order-btn"
        @click="open(UnitCommandTypes.Delivery)"
        :disabled="isCommandDisabled(UnitCommandTypes.Delivery)"
        :title="hotkeyTitle(UnitCommandTypes.Delivery)"
      >
        <span class="icon">✉️</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.delivery') }}</span>
      </button>

      <button
        class="order-btn"
        @click="clearCommands"
      >
        <span class="icon icon-formation">❌</span>
        <span class="label">{{ t('tools.command.clear_commands') }}</span>
      </button>
    </div>

    <!-- ===== DETAILS ===== -->
    <CommandAttack
      v-if="activeOrder === UnitCommandTypes.Attack"
      ref="attackRef"
      :units="units"
      @close="close"
    />

    <CommandMove
      v-if="activeOrder === UnitCommandTypes.Move"
      ref="moveRef"
      :units="units"
      @close="close"
    />

    <CommandDelivery
      v-if="activeOrder === UnitCommandTypes.Delivery"
      ref="deliveryRef"
      :units="units"
      @close="close"
    />

    <CommandChangeFormation
      v-if="activeOrder === UnitCommandTypes.ChangeFormation"
      ref="formationRef"
      :units="units"
      @close="close"
    />

    <CommandWait
      v-if="activeOrder === UnitCommandTypes.Wait"
      ref="waitRef"
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

.order-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: #1e293b;
  transform: none;
}

.order-btn:disabled:hover {
  background: #020617;
  border-color: #1e293b;
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

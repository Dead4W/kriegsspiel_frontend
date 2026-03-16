<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BaseUnit } from '@/engine/units/baseUnit'

import CommandAttack from './commands/CommandAttack.vue'
import CommandMove from "@/components/tools/commands/CommandMove.vue";
import {unitType} from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import CommandDelivery from "@/components/tools/commands/CommandDelivery.vue";
import CommandChangeFormation from "@/components/tools/commands/CommandChangeFormation.vue";
import CommandWait from "@/components/tools/commands/CommandWait.vue";
import CommandRetreat from "@/components/tools/commands/CommandRetreat.vue";
import { onUnitCommandRequest, type UnitCommandRequest } from '@/engine/input/unitCommandBus'

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'edit'): void
}>()

const { t } = useI18n()

const hotkeys: Record<string, UnitCommandTypes> = {
  '2': UnitCommandTypes.Attack,
  '3': UnitCommandTypes.ChangeFormation,
  '4': UnitCommandTypes.Wait,
  '5': UnitCommandTypes.Retreat,
}

const activeOrder = ref<UnitCommandTypes | null>(null)

const attackRef = ref<any>(null)
const moveRef = ref<any>(null)
const formationRef = ref<any>(null)
const waitRef = ref<any>(null)
const deliveryRef = ref<any>(null)
const retreatRef = ref<any>(null)

const autoAttackInfo = computed(() => {
  if (!props.units.length) {
    return {
      mixed: false,
      value: false,
      nextValue: false,
    }
  }

  const first = !!props.units[0]!.autoAttack
  const mixed = props.units.some(u => !!u.autoAttack !== first)
  const value = mixed ? false : first
  const nextValue = mixed ? true : !value

  return { mixed, value, nextValue }
})

const autoAttackTitle = computed(() => {
  const status = autoAttackInfo.value.mixed
    ? t('tools.command.autoAttack_state_mixed')
    : autoAttackInfo.value.value
      ? t('tools.command.autoAttack_state_on')
      : t('tools.command.autoAttack_state_off')
  return `${t('tools.command.autoAttack')}: ${status} (${t('hotkey')}: 1)`
})

function toggleAutoAttack() {
  if (!props.units.length) return
  const nextValue = autoAttackInfo.value.nextValue
  for (const u of props.units) {
    u.setAutoAttack(nextValue)
  }
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
}

function open(order: UnitCommandTypes) {
  if (isCommandDisabled(order)) return
  activeOrder.value = order
}

function adjustMorale(delta: number) {
  if (!props.units.length) return

  for (const u of props.units) {
    u.morale = (u.morale ?? 0) + delta
    u.setDirty()
  }
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
}

function close() {
  activeOrder.value = null
  emit('edit')
}

function isMessenger() {
  return props.units.filter(u => u.type === unitType.MESSENGER).length === props.units.length;
}

function isUiEventTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el?.closest?.('.krig-ui')
}

function clearCommands() {
  for (const u of props.units) {
    u.clearCommands()
    u.setDirty()
  }
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
}

function onKeydown(e: KeyboardEvent) {
  // C — cancel/clear planned commands for selected units
  if (e.code === 'KeyC' && !e.repeat) {
    // Keep behavior consistent with the ❌ button.
    if (props.units.length) {
      clearCommands()
      // If a command UI is open, close it after clearing.
      if (activeOrder.value) close()
      e.preventDefault()
      e.stopPropagation()
    }
    return
  }

  if ((e.key === 'Enter' || e.code === 'KeyE') && activeOrder.value) {
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
      case  UnitCommandTypes.Retreat:
        retreatRef.value?.confirm?.()
        break
    }
    return
  }

  if (e.key === 'Escape' || e.code === 'KeyQ') {
    if (activeOrder.value) {
      close()
      e.preventDefault()
      e.stopPropagation()
    }
    return
  }

  // если уже открыта команда — не перехватываем
  if (activeOrder.value) return

  // 1 — autoattack toggle
  if (e.key === '1' && props.units.length && !e.repeat) {
    toggleAutoAttack()
    e.preventDefault()
    e.stopPropagation()
    return
  }

  // Morale +/- hotkeys
  // "+" can be NumpadAdd or Shift+Equal on many layouts.
  const isMoralePlus  = e.code === 'NumpadAdd' || e.code === 'Equal'
  const isMoraleMinus = e.code === 'NumpadSubtract' || e.code === 'Minus'

  if ((isMoralePlus || isMoraleMinus) && props.units.length) {
    adjustMorale(isMoralePlus ? 1 : -1)
    e.preventDefault()
    e.stopPropagation()
    return
  }

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

async function onCommandRequest(req: UnitCommandRequest) {
  // Allow live updates for active Move (drag preview)
  if (activeOrder.value) {
    if (activeOrder.value !== UnitCommandTypes.Move) return
    if (req.command !== UnitCommandTypes.Move) return

    if (req.move.moveMode) {
      moveRef.value?.setMoveMode?.(req.move.moveMode)
    }
    moveRef.value?.applyContextTarget?.(req.move.pos, req.move.append)
    const shouldAutoConfirm = !!req.move.autoConfirm
    // Always ask ENV modifier for each picked point.
    moveRef.value?.openEnvMenu?.(req.move.pos, shouldAutoConfirm)
    if (shouldAutoConfirm) return
    return
  }

  if (isCommandDisabled(req.command)) return

  open(req.command)
  await nextTick()

  if (req.command === UnitCommandTypes.Move) {
    if (req.move.moveMode) {
      moveRef.value?.setMoveMode?.(req.move.moveMode)
    }
    moveRef.value?.applyContextTarget?.(req.move.pos, req.move.append)
    const shouldAutoConfirm = !!req.move.autoConfirm
    // Always ask ENV modifier for each picked point.
    moveRef.value?.openEnvMenu?.(req.move.pos, shouldAutoConfirm)
    if (shouldAutoConfirm) return
    return
  }

  const hit = window.ROOM_WORLD.units.get(req.selectUnitId)
  if (!hit) return

  window.ROOM_WORLD.units.select(hit)
  window.ROOM_WORLD.events.emit('changed', { reason: 'select' })
}

// LIFE CYCLE
let unsubCommandRequests: null | (() => void) = null

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  unsubCommandRequests = onUnitCommandRequest(onCommandRequest)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubCommandRequests?.()
  unsubCommandRequests = null
})

</script>

<template>
  <div class="orders-root">

    <!-- ===== BUTTONS ===== -->
    <div v-if="!activeOrder" class="orders-buttons">
      <div class="order-stack">
        <button
          class="order-btn autoattack"
          type="button"
          @click="toggleAutoAttack"
          :disabled="!units.length"
          :title="autoAttackTitle"
          :class="{
            'is-on': !autoAttackInfo.mixed && autoAttackInfo.value,
            'is-off': !autoAttackInfo.mixed && !autoAttackInfo.value,
            'is-mixed': autoAttackInfo.mixed,
          }"
        >
          <span class="icon">⚔</span>
          <span class="label">
            {{ t('tools.command.autoAttack') }}<br>
            <template v-if="autoAttackInfo.mixed">{{ t('tools.command.autoAttack_state_mixed') }}</template>
            <template v-else>
              {{ autoAttackInfo.value ? t('tools.command.autoAttack_state_on') : t('tools.command.autoAttack_state_off') }}
            </template>
          </span>
        </button>

        <button
          class="order-btn attack"
          @click="open(UnitCommandTypes.Attack)"
          :disabled="isCommandDisabled(UnitCommandTypes.Attack)"
          :title="hotkeyTitle(UnitCommandTypes.Attack)"
        >
          <span class="icon">⚔</span>
          <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.attack') }}</span>
        </button>
      </div>

<!--      <button-->
<!--        class="order-btn"-->
<!--        @click="open(UnitCommandTypes.Move)"-->
<!--        :disabled="isCommandDisabled(UnitCommandTypes.Move)"-->
<!--        :title="hotkeyTitle(UnitCommandTypes.Move)"-->
<!--      >-->
<!--        <span class="icon">🚶</span>-->
<!--        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.move') }}</span>-->
<!--      </button>-->

      <button
        class="order-btn"
        @click="open(UnitCommandTypes.ChangeFormation)"
        :disabled="isCommandDisabled(UnitCommandTypes.ChangeFormation)"
        :title="hotkeyTitle(UnitCommandTypes.ChangeFormation)"
      >
        <span class="icon icon-formation">■■■</span>
        <span class="label">{{ t('tools.command.formation') }}</span>
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

<!--      <button-->
<!--        class="order-btn"-->
<!--        @click="open(UnitCommandTypes.Delivery)"-->
<!--        :disabled="isCommandDisabled(UnitCommandTypes.Delivery)"-->
<!--        :title="hotkeyTitle(UnitCommandTypes.Delivery)"-->
<!--      >-->
<!--        <span class="icon">✉️</span>-->
<!--        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.delivery') }}</span>-->
<!--      </button>-->

      <button
        class="order-btn retreat"
        @click="open(UnitCommandTypes.Retreat)"
        :disabled="isCommandDisabled(UnitCommandTypes.Retreat)"
        :title="hotkeyTitle(UnitCommandTypes.Retreat)"
      >
        <span class="icon">🏳️</span>
        <span class="label">{{ t('tools.command.command') }}<br>{{ t('tools.command.retreat') }}</span>
      </button>

      <div class="order-stack">
        <button
          class="order-btn morale-plus"
          type="button"
          @click="adjustMorale(1)"
          :disabled="!units.length"
          :title="`${t('stat.morale')}: +1 (${t('hotkey')}: +)`"
        >
          <span class="icon">+1</span>
          <span class="label">
            {{ t('stat.morale') }}<br>
          </span>
        </button>

        <button
          class="order-btn morale-minus"
          type="button"
          @click="adjustMorale(-1)"
          :disabled="!units.length"
          :title="`${t('stat.morale')}: -1 (${t('hotkey')}: -)`"
        >
          <span class="icon">-1</span>
          <span class="label">
            {{ t('stat.morale') }}<br>
          </span>
        </button>
      </div>

      <button
        class="order-btn"
        @click="clearCommands"
        :title="`${t('hotkey')}: C`"
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

    <CommandRetreat
      v-if="activeOrder === UnitCommandTypes.Retreat"
      ref="retreatRef"
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

.order-stack {
  flex: 1;
  min-width: 60px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.order-btn.retreat {
  color: #fbbf24;
  border-color: #78350f;
}

.order-btn.retreat:hover {
  border-color: #f59e0b;
}

.order-btn.autoattack {
  color: #94a3b8;
  border-color: #334155;
}

.order-btn.autoattack.is-off:hover {
  border-color: #64748b;
}

.order-btn.autoattack.is-on {
  color: #4ade80;
  border-color: #14532d;
}

.order-btn.autoattack.is-on:hover {
  border-color: #22c55e;
}

.order-btn.autoattack.is-mixed {
  color: #fbbf24;
  border-color: #78350f;
}

.order-btn.autoattack.is-mixed:hover {
  border-color: #f59e0b;
}

.order-btn.morale-plus {
  color: #4ade80;
  border-color: #14532d;
}

.order-btn.morale-plus:hover {
  border-color: #22c55e;
}

.order-btn.morale-minus {
  color: #f87171;
  border-color: #7f1d1d;
}

.order-btn.morale-minus:hover {
  border-color: #ef4444;
}

</style>

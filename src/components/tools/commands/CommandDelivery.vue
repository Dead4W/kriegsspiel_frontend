<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {BaseUnit} from '@/engine/units/baseUnit'
import type {OverlayItem, OverlayLine} from '@/engine/types/overlayTypes'
import {DeliveryCommand} from '@/engine/units/commands/deliveryCommand'
import {getTeamColor} from '@/engine/2d/render'
import {type unitTeam, unitType} from '@/engine'
import type {unsub} from '@/engine/events'
import HotkeyTag from '@/components/ui/HotkeyTag.vue'
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import type {MoveCommandState} from "@/engine/units/commands/moveCommand.ts";
import {MoveCommand} from "@/engine/units/commands/moveCommand.ts";
import {buildRoadTurnRoutePoints} from "@/engine/world/roadPath.ts";

const { t } = useI18n()

const props = defineProps<{
  units: BaseUnit[]   // messenger'ы
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/* ================= SNAPSHOT ================= */

const messengers = ref<BaseUnit[]>([])
const targets = ref<BaseUnit[]>([])

/* ================= GROUPING ================= */

interface UnitGroup {
  type: unitType
  team: unitTeam
  count: number
}

function group(units: UnwrapRef<BaseUnit[]>): UnitGroup[] {
  const map = new Map<string, UnitGroup>()

  for (const u of units) {
    const key = `${u.type}:${u.team}`
    map.set(key, {
      type: u.type,
      team: u.team,
      count: (map.get(key)?.count ?? 0) + 1,
    })
  }

  return [...map.values()]
}

const messengersGrouped = computed(() => group(messengers.value))
const targetsGrouped = computed(() => group(targets.value))

/* ================= UTILS ================= */

function teamColor(team: unitTeam) {
  const { r, g, b } = getTeamColor(team)
  return `rgba(${r},${g},${b},1)`
}

function getMessengerMoveTargets(messenger: (typeof messengers.value)[number]) {
  const targets: Array<{ x: number; y: number }> = []
  for (const cmd of messenger.getCommands()) {
    if (cmd.type !== UnitCommandTypes.Move) continue
    const moveState = cmd.getState().state as MoveCommandState
    if (DeliveryCommand.isDeliveryMoveComment(moveState.comment)) continue
    targets.push({ x: moveState.target.x, y: moveState.target.y })
  }
  return targets
}

function hasPendingRegularMove(messenger: (typeof messengers.value)[number]): boolean {
  return messenger.getCommands().some((cmd) => {
    if (cmd.type !== UnitCommandTypes.Move) return false
    if (cmd.isFinished(messenger as BaseUnit)) return false
    const moveState = cmd.getState().state as MoveCommandState
    return !DeliveryCommand.isDeliveryMoveComment(moveState.comment)
  })
}

function resolveDeliveryTargetByNearestGoal(from: { x: number; y: number }): (typeof targets.value)[number] | null {
  if (!targets.value.length) return null
  const aliveTargets = targets.value.filter((u) => u.alive)
  if (!aliveTargets.length) return null

  const distanceToFrom = (target: (typeof aliveTargets)[number]) => Math.hypot(target.pos.x - from.x, target.pos.y - from.y)
  const generals = aliveTargets.filter((u) => u.type === unitType.GENERAL)
  if (generals.length) {
    return generals.slice().sort((a, b) => distanceToFrom(a) - distanceToFrom(b))[0]!
  }
  return aliveTargets.slice().sort((a, b) => distanceToFrom(a) - distanceToFrom(b))[0]!
}

function buildDeliveryRoutePoints(from: { x: number; y: number }, goal: { x: number; y: number }) {
  const points = buildRoadTurnRoutePoints(window.ROOM_WORLD, from, goal)
  if (points.length) return points
  return [{ x: goal.x, y: goal.y }]
}

/* ================= SELECTION ================= */

function syncTargets() {
  targets.value = window.ROOM_WORLD.units
    .list()
    .filter(u =>
      u.selected &&
      u.type !== unitType.MESSENGER &&
      u.team === messengers.value[0]!.team &&
      (
        // Сообщение адресовано ему
        props.units.filter(
          mu => mu.messages.filter(m => m.unitIds.includes(u.id)).length || mu.type === unitType.GENERAL
        ).length
        // Или генерал
        || u.type === unitType.GENERAL
      )
    )
}

/* ================= ACTION ================= */

function confirm() {
  if (!targets.value.length) return

  for (const m of messengers.value) {
    const regularMoveTargets = getMessengerMoveTargets(m)
    const routeStart = regularMoveTargets.length
      ? regularMoveTargets[regularMoveTargets.length - 1]!
      : { x: m.pos.x, y: m.pos.y }
    const deliveryTarget = resolveDeliveryTargetByNearestGoal(routeStart)

    const cmd = new DeliveryCommand({
      targets: targets.value.map(u => u.id),
    })

    const currentCommands = m.getCommands().filter((command) => {
      if (command.type !== UnitCommandTypes.Move) return true
      const moveState = command.getState().state as MoveCommandState
      return !DeliveryCommand.isDeliveryMoveComment(moveState.comment)
    })

    const nextCommands = [...currentCommands, cmd]
    const shouldAppendDeliveryMovesNow = !hasPendingRegularMove(m)
    if (deliveryTarget && shouldAppendDeliveryMovesNow) {
      const routePoints = buildDeliveryRoutePoints(routeStart, deliveryTarget.pos)
      const uniqueId = crypto.randomUUID()
      const routeCommands = routePoints.map((point, segIndex) => new MoveCommand({
        target: { x: point.x, y: point.y },
        modifier: null,
        comment: DeliveryCommand.DELIVERY_MOVE_COMMENT,
        abilities: [],
        orderIndex: 0,
        uniqueId,
        segIndex,
        isPatrol: false,
      }))
      nextCommands.push(...routeCommands)
    }

    m.setCommands(nextCommands)
    m.setDirty()
  }

  cleanup()
  emit('close')
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })
}

/* ================= OVERLAY ================= */

function rebuildOverlay() {
  if (!messengers.value.length || !targets.value.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  const items: OverlayItem[] = []

  for (const m of messengers.value) {
    let from = { x: m.pos.x, y: m.pos.y }

    // Show existing manual move route before delivery leg.
    for (const moveTarget of getMessengerMoveTargets(m)) {
      items.push({
        type: 'line',
        from,
        to: moveTarget,
        color: 'rgba(34,197,94,0.65)',
        width: 2,
        dash: [6, 6],
      } satisfies OverlayLine)
      from = moveTarget
    }

    const deliveryTarget = resolveDeliveryTargetByNearestGoal(from)
    if (!deliveryTarget) continue
    const deliveryRoute = buildDeliveryRoutePoints(from, deliveryTarget.pos)
    for (const routePoint of deliveryRoute) {
      items.push({
        type: 'line',
        from,
        to: routePoint,
        color: '#38bdf8',
        width: 1,
        dash: [4, 6],
      } satisfies OverlayLine)
      from = routePoint
    }
  }

  window.ROOM_WORLD.setOverlay(items)
}

/* ================= LIFE CYCLE ================= */

let unsubscribe: unsub

function cleanup() {
  messengers.value = []
  targets.value = []
  window.ROOM_WORLD.clearOverlay()
  unsubscribe?.()
}

onMounted(() => {
  messengers.value = [...props.units]
  syncTargets()
  rebuildOverlay()

  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason !== 'select') return
    syncTargets()
    rebuildOverlay()
  })
})

onUnmounted(cleanup)

defineExpose({
  confirm,
})

</script>

<template>
  <div class="order-delivery">

    <!-- ===== MESSENGERS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.from') }}</div>
      <div class="cards">
        <div
          v-for="m in messengersGrouped"
          :key="m.type + m.team"
          class="card"
          :style="{ color: teamColor(m.team) }"
        >
          {{ t(`unit.${m.type}`) }} × {{ m.count }}
        </div>
      </div>
    </div>

    <div class="arrow">➜</div>

    <!-- ===== TARGETS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.from') }}</div>

      <div v-if="!targetsGrouped.length" class="hint">
        {{ t('tools.command.delivery_hint') }}
      </div>

      <div class="cards">
        <div
          v-for="tg in targetsGrouped"
          :key="tg.type + tg.team"
          class="card"
          :style="{ color: teamColor(tg.team) }"
        >
          {{ t(`unit.${tg.type}`) }} × {{ tg.count }}
        </div>
      </div>
    </div>

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button
        class="btn confirm"
        :disabled="!targets.length"
        @click="confirm"
        :title="`${t('hotkey')}: E`"
      >
        {{ t('tools.command.apply') }}
        <HotkeyTag key-label="E" />
      </button>
      <button class="btn cancel" @click="emit('close')" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
        <HotkeyTag key-label="Q" />
      </button>
    </div>

  </div>
</template>

<style scoped>
.order-delivery {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 12px;
  background: #020617ee;
  border-top: 1px solid #334155;
  font-size: 11px;
}

/* ===== columns ===== */

.column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.column.settings {
  min-width: 140px;
}

.column.actions {
  justify-content: flex-end;
}

/* ===== text ===== */

.title {
  color: #94a3b8;
  font-size: 10px;
}

.hint {
  font-size: 10px;
  color: #64748b;
}

/* ===== cards ===== */

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card {
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: var(--panel);
  white-space: nowrap;
}

/* ===== arrow ===== */

.arrow {
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 14px;
}

/* ===== message select ===== */

select {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #e5e7eb;
  outline: none;
}

select:focus {
  border-color: #38bdf8;
}

/* ===== buttons ===== */

.btn {
  position: relative;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  cursor: pointer;
}

.btn.confirm {
  color: #38bdf8; /* доставка = голубой */
  border-color: #0c4a6e;
}

.btn.confirm:hover {
  border-color: #38bdf8;
}

.btn.cancel {
  color: #94a3b8;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

</style>

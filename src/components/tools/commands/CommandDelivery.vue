<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {BaseUnit} from '@/engine/units/baseUnit'
import type {OverlayItem, OverlayLine} from '@/engine/types/overlayTypes'
import {DeliveryCommand} from '@/engine/units/commands/deliveryCommand'
import {getTeamColor} from '@/engine/render/util'
import {type unitTeam, unitType} from '@/engine'
import type {unsub} from '@/engine/events'

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

  const cmd = new DeliveryCommand({
    targets: targets.value.map(u => u.id),
  })

  for (const m of messengers.value) {
    m.addCommand(cmd.getState())
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
    for (const t of targets.value) {
      items.push({
        type: 'line',
        from: m.pos,
        to: t.pos,
        color: '#38bdf8',
        width: 1,
        dash: [4, 6],
      } satisfies OverlayLine)
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
        {{ t('tools.command.delivery_confirm') }}
      </button>
      <button class="btn cancel" @click="emit('close')" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
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
  background: #020617;
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

<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import type {BaseUnit} from '@/engine/units/baseUnit'
import {useI18n} from 'vue-i18n'
import {getTeamColor} from "@/engine/2d/render";
import { type commandstate, type unitTeam } from "@/engine";
import type {unsub} from "@/engine/events";
import type {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";
import { getInaccuracyAbility } from "@/engine/resourcePack/abilities.ts";
import HotkeyTag from '@/components/ui/HotkeyTag.vue'
import { groupUnitsByTypeAndTeam } from "@/game/commands/shared/groupUnitsByTypeAndTeam";
import {
  applyAttackOrder,
  buildAttackOverlayItems,
  buildAttackSelectionSnapshot,
  getUnitPickRadiusPx,
  isTargetInRangeOfAnyAttacker,
  toAttackPoint,
  type AttackInaccuracyPoint,
} from "@/game/commands/attack";
import { isAdminTeam } from "@/game/roomGuards";
import {
  canPlayerUseDirectViewOrder,
  getUnitsEligibleForDirectViewOrder,
  isPlayerDirectViewOrderContext,
} from "@/engine/units/directViewOrderRules";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes";
import { CommandStatus } from "@/engine/units/commands/baseCommand";

const {t} = useI18n()

const props = defineProps<{
  units: BaseUnit[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function teamColor(team: unitTeam) {
  const {r, g, b} = getTeamColor(team)
  return `rgba(${r},${g},${b}, 1)`
}

/* ================= SNAPSHOT ================= */

/** Атакующие фиксируются при открытии */
const attackers = ref<BaseUnit[]>([])

/** Цели — считаются по текущему выделению */
const targets = ref<BaseUnit[]>([])

const inaccuracyPoint = ref<AttackInaccuracyPoint | null>(null)

const selectedAbilities = ref<UnitAbilityType[]>([])
function toggleAbility(a: UnitAbilityType) {
  if (selectedAbilities.value.includes(a)) {
    selectedAbilities.value = selectedAbilities.value.filter(x => x !== a)
  } else {
    selectedAbilities.value.push(a)
  }
  syncTargets()
}

const availableAbilities = computed<UnitAbilityType[]>(() => {
  const set = new Set<UnitAbilityType>()
  for (const u of attackers.value) {
    for (const a of u.abilities) {
      set.add(a)
    }
  }

  return [...set]
})

/* ================= GROUPING ================= */

const attackersGrouped = computed(() => groupUnitsByTypeAndTeam(attackers.value))
const targetsGrouped = computed(() => groupUnitsByTypeAndTeam(targets.value))

/* ================= DAMAGE ================= */

const damageModifier = ref(1.0)
const radiusModifier = ref(1.0)

const inaccuracyAbility = computed(() => getInaccuracyAbility(selectedAbilities.value))
const hasInaccuracyFire = computed(() => !!inaccuracyAbility.value)
const isAdmin = computed(() => isAdminTeam())

watch(selectedAbilities, (list) => {
  if (!getInaccuracyAbility(list)) {
    inaccuracyPoint.value = null
  }
})
watch(selectedAbilities, rebuildAttackOverlay)
watch(inaccuracyPoint, rebuildAttackOverlay)

/* ================= SELECTION SYNC ================= */

function syncTargets() {
  const selection = buildAttackSelectionSnapshot({
    allUnits: window.ROOM_WORLD.units.list(),
    attackerTeam: attackers.value[0]?.team,
    inaccuracyEnabled: hasInaccuracyFire.value,
    inaccuracyAbility: inaccuracyAbility.value?.ability,
  })
  attackers.value = selection.attackers
  targets.value = selection.targets
}

/* ================= ACTION ================= */

function confirm() {
  if (!targets.value.length && !inaccuracyPoint.value) return

  const directViewEligibleUnits = getUnitsEligibleForDirectViewOrder(attackers.value) as BaseUnit[]
  const unitsToApply = isPlayerDirectViewOrderContext()
    ? directViewEligibleUnits
    : attackers.value
  if (!unitsToApply.length) return

  const nextDamageModifier = isAdmin.value ? damageModifier.value : 1.0
  const nextRadiusModifier = isAdmin.value ? radiusModifier.value : 1.0
  applyAttackOrder({
    attackers: unitsToApply,
    targets: targets.value,
    damageModifier: nextDamageModifier,
    radiusModifier: nextRadiusModifier,
    abilities: selectedAbilities.value,
    inaccuracyPoint: inaccuracyPoint.value?.pos ?? null,
  })
  const shouldSendDirectViewOrder = canPlayerUseDirectViewOrder(unitsToApply)
  if (shouldSendDirectViewOrder) {
    for (const unit of unitsToApply) {
      const attackCommand: commandstate = {
        type: UnitCommandTypes.Attack,
        status: CommandStatus.Pending,
        state: {
          targets: targets.value.map((target) => target.id),
          damageModifier: 1.0,
          radiusModifier: 1.0,
          abilities: selectedAbilities.value,
          inaccuracyPoint: inaccuracyPoint.value?.pos ?? null,
        },
      }
      window.ROOM_WORLD.events.emit("api", {
        type: "direct_view_send_order",
        team: window.PLAYER.team as any,
        data: {
          unitId: unit.id,
          commands: [attackCommand],
        },
      })
    }
  }

  attackers.value = []
  targets.value = []
  selectedAbilities.value = []

  window.ROOM_WORLD.clearOverlay()
  emit('close')
  window.ROOM_WORLD.events.emit('changed', { reason: 'unit' })

  inaccuracyPoint.value = null
}

// OVERLAY

function rebuildAttackOverlay() {
  if (!attackers.value.length) {
    window.ROOM_WORLD.clearOverlay()
    return
  }

  const items = buildAttackOverlayItems({
    attackers: attackers.value,
    targets: targets.value,
    inaccuracyPoint: inaccuracyPoint.value?.pos ?? null,
    inaccuracyEnabled: hasInaccuracyFire.value,
    radiusModifier: radiusModifier.value,
    inaccuracyRadiusMultiplier: inaccuracyAbility.value?.radiusMult ?? 1,
    metersPerPixel: window.ROOM_WORLD.map.metersPerPixel,
  })

  window.ROOM_WORLD.setOverlay(items)
}
watch(
  () => radiusModifier.value,
  rebuildAttackOverlay
)

function onPointerDown(e: PointerEvent) {
  if (e.button !== 2) return

  // Don't treat RMB on UI as target selection.
  if ((e.target as HTMLElement)?.closest('.krig-ui')) return

  e.stopPropagation()
  e.preventDefault()

  const world = window.ROOM_WORLD
  const pos = world.camera.screenToWorld({
    x: e.clientX,
    y: e.clientY,
  })

  // ===== Inaccuracy fire: RMB sets point =====
  if (hasInaccuracyFire.value) {
    // ПКМ — задать / переместить точку атаки
    inaccuracyPoint.value = toAttackPoint(pos)
    rebuildAttackOverlay()
    return
  }

  // ===== Normal fire: RMB selects/toggles target unit =====
  if (!attackers.value.length) return
  const attackerTeam = attackers.value[0]!.team

  const unitSizeScale = window.CLIENT_SETTINGS?.[CLIENT_SETTING_KEYS.SIZE_UNIT] ?? 1
  const hit = world.units.pickAt(pos, getUnitPickRadiusPx(unitSizeScale))
  if (!hit) return
  if (!hit.alive || hit.isRetreat) return
  if (hit.team === attackerTeam) return

  // All checks: at least one attacker can reach the target by range.
  if (!isTargetInRangeOfAnyAttacker(hit, attackers.value)) return

  hit.selected = !hit.selected
  world.events.emit('changed', { reason: 'select' })
}

// LIFE CYCLE

let unsubscribe: unsub;

onMounted(() => {
  inaccuracyPoint.value = null
  if (props.units.length > 0) {
    attackers.value = props.units.filter(u => u.team === props.units[0]!.team)
    targets.value = props.units.filter(u => u.team !== props.units[0]!.team)
  }
  syncTargets()

  rebuildAttackOverlay()

  unsubscribe = window.ROOM_WORLD.events.on('changed', ({ reason }) => {
    if (reason !== 'select') return;
    syncTargets()
    rebuildAttackOverlay()
  })

  window.addEventListener('pointerdown', onPointerDown, true)
})

onUnmounted(() => {
  attackers.value = [];
  targets.value = [];
  unsubscribe();

  window.ROOM_WORLD.events.off('changed', syncTargets)
  window.ROOM_WORLD.clearOverlay()

  window.removeEventListener('pointerdown', onPointerDown, true)
})

defineExpose({
  confirm,
})

</script>

<template>
  <div class="order-attack">

    <!-- ===== ATTACKERS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.attackers') }}</div>
      <div class="cards">
        <div
          v-for="a in attackersGrouped"
          :key="a.type + a.team"
          class="card"
          :style="{ color: teamColor(a.team) }"
        >
          {{ t(`unit.${a.type}`) }} × {{ a.count }}
        </div>
      </div>
    </div>

    <!-- ===== ARROW ===== -->
    <div class="arrow">➜</div>

    <!-- ===== TARGETS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.targets') }}</div>
      <div class="cards">
        <div
          v-if="!targetsGrouped.length && !inaccuracyPoint"
          class="hint"
        >
          {{ t('tools.command.attackHint') }}
        </div>

        <template v-if="targetsGrouped.length > 0">
          <div
            v-for="targetGroup in targetsGrouped"
            :key="targetGroup.type + targetGroup.team"
            class="card"
            :style="{ color: teamColor(targetGroup.team) }"
          >
            {{ t(`unit.${targetGroup.type}`) }} × {{ targetGroup.count }}
          </div>
        </template>
        <template v-if="inaccuracyPoint">
          <div
            class="card"
          >
            x={{ inaccuracyPoint.pos.x.toFixed(0) }}, y={{ inaccuracyPoint.pos.y.toFixed(0) }}
          </div>
        </template>
      </div>
    </div>

    <!-- ===== ABILITIES ===== -->
    <div
      v-if="availableAbilities.length"
      class="column abilities"
    >
      <div class="title">
        {{ t('command.abilities') }}
      </div>

      <div class="cards">
        <button
          v-for="a in availableAbilities"
          :key="a"
          class="card ability"
          :class="{ active: selectedAbilities.includes(a) }"
          @click="toggleAbility(a)"
        >
          {{ t(`ability.${a}`) }}
        </button>
      </div>
    </div>

    <!-- ===== SETTINGS ===== -->
    <div v-if="isAdmin" class="column settings">
      <!-- damage modifier -->
      <div class="setting-row">
        <div class="title">
          {{ t('command.damage_modifier') }} × {{ damageModifier.toFixed(2) }}
        </div>
        <input
          type="range"
          min="0.00"
          max="2"
          step="0.05"
          v-model.number="damageModifier"
        />
      </div>

      <!-- inaccuracy radius modifier -->
      <div class="setting-row" v-if="hasInaccuracyFire">
        <div class="title">
          {{ t('command.inaccuracy_radius') }} × {{ radiusModifier.toFixed(2) }}
        </div>
        <input
          type="range"
          min="0.00"
          max="2"
          step="0.05"
          v-model.number="radiusModifier"
        />
      </div>
    </div>


    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button
        class="btn confirm"
        :disabled="!targets.length && !inaccuracyPoint"
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
.order-attack {
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

.column.abilities {
  min-width: 200px;
}

.card.ability {
  cursor: pointer;
  font-size: 10px;
  color: #94a3b8;
}

.card.ability.active {
  color: #22c55e;
  border-color: #22c55e;
  background: #052e16;
}

.column.settings {
  min-width: 160px;
}

.setting-row {
  width: 100%;
}

.setting-row input {
  width: 100%;
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

.card.attacker {
  color: #f87171;
}

.card.target {
  color: #60a5fa;
}

/* ===== arrow ===== */

.arrow {
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 14px;
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
  color: #22c55e;
}

.btn.cancel {
  color: #94a3b8;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>

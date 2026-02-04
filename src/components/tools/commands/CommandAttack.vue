<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, type UnwrapRef, watch} from 'vue'
import type {BaseUnit} from '@/engine/units/baseUnit'
import {useI18n} from 'vue-i18n'
import type {OverlayCircle, OverlayItem, OverlayLine} from "@/engine/types/overlayTypes.ts";
import {AttackCommand} from "@/engine/units/commands/attackCommand.ts";
import {getTeamColor} from "@/engine/render/util.ts";
import {type unitTeam, unitType} from "@/engine";
import type {unsub} from "@/engine/events";
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import {CLIENT_SETTING_KEYS} from "@/enums/clientSettingsKeys.ts";

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

const inaccuracyRadius = ref(0)
const inaccuracyPoint = ref<{ pos: { x: number; y: number } } | null>(null)

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

const attackersGrouped = computed(() => group(attackers.value))
const targetsGrouped = computed(() => group(targets.value))

/* ================= DAMAGE ================= */

const damageModifier = ref(1.0)

watch(selectedAbilities, (list) => {
  if (!list.includes(UnitAbilityType.INACCURACY_FIRE)) {
    inaccuracyPoint.value = null
  }
})
watch(inaccuracyRadius, rebuildAttackOverlay)
watch(selectedAbilities, rebuildAttackOverlay)
watch(inaccuracyPoint, rebuildAttackOverlay)

/* ================= SELECTION SYNC ================= */

function syncTargets() {
  targets.value = window.ROOM_WORLD.units
    .list()
    .filter(u => u.selected && u.team !== attackers.value[0]?.team)
  attackers.value = window.ROOM_WORLD.units
    .list()
    .filter(u => u.selected && u.team === attackers.value[0]?.team)
  if (selectedAbilities.value.includes(UnitAbilityType.INACCURACY_FIRE)) {
    attackers.value = attackers.value.filter(u => u.type === unitType.ARTILLERY);
    targets.value = [];
  }
}

/* ================= ACTION ================= */

function confirm() {
  if (!targets.value.length && !inaccuracyPoint.value) return

  const cmd = new AttackCommand({
    targets: targets.value.map(u => u.id),
    damageModifier: damageModifier.value,
    abilities: selectedAbilities.value,
    inaccuracyPoint: inaccuracyPoint.value ? inaccuracyPoint.value.pos : null,
  })

  for (const u of attackers.value) {
    u.addCommand(cmd.getState())
    u.setDirty()
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

  const items: OverlayItem[] = []

  /* точка + радиус неточного огня */
  if (
    selectedAbilities.value.includes(UnitAbilityType.INACCURACY_FIRE)
  ) {
    if (inaccuracyPoint.value) {
      items.push(
        {
          type: 'circle',
          center: inaccuracyPoint.value.pos,
          radius: inaccuracyRadius.value / window.ROOM_WORLD.map.metersPerPixel,
          color: 'rgba(168,85,247,0.45)',
          fill: true,
        } satisfies OverlayCircle
      )
      for (const a of attackers.value) {
        items.push({
          type: 'line',
          from: a.pos,
          to: inaccuracyPoint.value.pos,
          color: '#facc15',
          width: 1,
          dash: [6, 6],
          dashOffset: -1,
        } satisfies OverlayLine)
      }
    }
  } else {
    /* линии атаки (если есть обычные цели) */
    for (const a of attackers.value) {
      for (const t of targets.value) {
        items.push({
          type: 'line',
          from: a.pos,
          to: t.pos,
          color: '#facc15',
          width: 1,
          dash: [6, 6],
          dashOffset: -1,
        } satisfies OverlayLine)
      }
    }
  }

  window.ROOM_WORLD.setOverlay(items)
}

function unitPickRadiusPx() {
  return 15 * (window.CLIENT_SETTINGS?.[CLIENT_SETTING_KEYS.SIZE_UNIT] ?? 1)
}

function isTargetInRangeOfAnyAttacker(target: BaseUnit) {
  for (const a of attackers.value) {
    if (!a.alive || a.isTimeout) continue
    const dx = target.pos.x - a.pos.x
    const dy = target.pos.y - a.pos.y
    if (dx * dx + dy * dy <= a.attackRange * a.attackRange) return true
  }
  return false
}


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
  if (selectedAbilities.value.includes(UnitAbilityType.INACCURACY_FIRE)) {
    // ПКМ — задать / переместить точку атаки
    inaccuracyPoint.value = { pos }

    let sumDist = 0;
    for (const a of attackers.value) {
      sumDist += computeInaccuracyRadius(
        a as BaseUnit,
        pos,
      )
    }
    inaccuracyRadius.value = sumDist / attackers.value.length;

    rebuildAttackOverlay()
    return
  }

  // ===== Normal fire: RMB selects/toggles target unit =====
  if (!attackers.value.length) return
  const attackerTeam = attackers.value[0]!.team

  const hit = world.units.pickAt(pos, unitPickRadiusPx())
  if (!hit) return
  if (!hit.alive || hit.isTimeout) return
  if (hit.team === attackerTeam) return

  // All checks: at least one attacker can reach the target by range.
  if (!isTargetInRangeOfAnyAttacker(hit)) return

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
    <div class="column settings">
      <!-- damage modifier -->
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


    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button
        class="btn confirm"
        :disabled="!targets.length && !inaccuracyPoint"
        @click="confirm"
        :title="`${t('hotkey')}: E`"
      >
        {{ t('tools.command.attack') }}
      </button>

      <button class="btn cancel" @click="emit('close')" :title="`${t('hotkey')}: Q`">
        {{ t('tools.command.cancel') }}
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
  min-width: 140px;
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

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { BaseUnit } from "@/engine/units/baseUnit";
import type { vec2 } from "@/engine/types";
import { getTeamColor } from "@/engine/2d/render";
import { type unitTeam, unitType } from "@/engine";
import type { unsub } from "@/engine/events";
import { CLIENT_SETTING_KEYS } from "@/enums/clientSettingsKeys";
import type { UnitAbilityType } from "@/engine/units/modifiers/UnitAbilityModifiers";
import { hasAbilityInaccuracyRadius } from "@/engine/resourcePack/abilities";
import RadialMenu, { type RadialMenuItem } from "@/components/ui/RadialMenu.vue";
import HotkeyTag from "@/components/ui/HotkeyTag.vue";
import {
  getEnvironmentIcon,
  getRouteEnvironmentStates,
  type EnvironmentStateId,
} from "@/engine/resourcePack/environment";
import { getColumnSegmentRoutePoints } from "@/engine/units/formationMoveAlgorithms/columnAlgorithms";
import { isAdminTeam } from "@/game/roomGuards";
import { groupUnitsByTypeAndTeam } from "@/game/commands/shared/groupUnitsByTypeAndTeam";
import {
  applyMoveOrder,
  buildContextRouteUpdate,
  getColumnRouteStartPosByTarget,
  buildMoveFormationCenter,
  buildMoveFormationOffsets,
  buildMoveOverlayItems,
  buildMovePlan,
  getNearestSelectedUnitPlannedPos,
  getRouteDistancesMeters,
  type MoveMode,
  type MoveRoutePoint,
} from "@/game/commands/move";
import { isPointInsideActiveZone } from "@/game/planningSpawns";
import {
  getUnitsEligibleForDirectViewOrder,
  isPlayerDirectViewOrderContext,
} from "@/engine/units/directViewOrderRules";

const { t } = useI18n();

function teamColor(team: unitTeam) {
  const { r, g, b } = getTeamColor(team);
  return `rgba(${r},${g},${b}, 1)`;
}

function envIcon(state: EnvironmentStateId) {
  return getEnvironmentIcon(state);
}

function setRouteModifier(modifier: EnvironmentStateId | null) {
  if (!targets.value.length) return;
  targets.value[targets.value.length - 1]!.modifier = modifier;
  rebuildMoveOverlay();
}

const props = defineProps<{
  units: BaseUnit[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const ROUTE_MODIFIERS = computed(() => getRouteEnvironmentStates());

const movingUnits = ref<BaseUnit[]>([]);
const targets = ref<MoveRoutePoint[]>([]);
const isPatrol = ref(false);
const smartPathEnabled = ref(false);
const routeListRef = ref<HTMLElement | null>(null);

const routeStartPos = computed<vec2 | null>(() => {
  const unit = movingUnits.value[0];
  if (!unit) return null;
  if (ignoreExistingMoveCommandsForPreview.value) {
    return unit.pos;
  }
  return unit.futurePos ?? unit.pos;
});

const routeDistancesMeters = computed<number[]>(() =>
  getRouteDistancesMeters(
    routeStartPos.value,
    targets.value,
    window.ROOM_WORLD?.map?.metersPerPixel ?? 1
  )
);

const hasObjectMap = computed(() => window.ROOM_WORLD.hasObjectNavMeshMap());
const isAdmin = computed(() => isAdminTeam());
const ignoreExistingMoveCommandsForPreview = computed(() => isPlayerDirectViewOrderContext());

function getMoveEligibleUnits(units: BaseUnit[]): BaseUnit[] {
  if (isAdmin.value) return [...units];
  return getUnitsEligibleForDirectViewOrder(units) as BaseUnit[];
}

function fmtMeters(meters: number) {
  return `${Math.round(meters)} m`;
}

const moveMode = ref<MoveMode>("column");

function loadSmartPathPreference(units: Array<{ type: unitType }>) {
  if (!hasObjectMap.value) {
    smartPathEnabled.value = false;
    return;
  }
  if (!isAdmin.value) {
    smartPathEnabled.value = moveMode.value === "column";
    return;
  }

  const isSingleMessenger = units.length === 1 && units[0]!.type === unitType.MESSENGER;
  if (isSingleMessenger) {
    smartPathEnabled.value = true;
    return;
  }

  smartPathEnabled.value = Boolean(window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.MOVE_SMART_PATH]);
}

function getSegmentRoutePoints(from: vec2, to: vec2): vec2[] {
  if (moveMode.value === "formation") {
    return [{ x: to.x, y: to.y }];
  }
  return getColumnSegmentRoutePoints(
    window.ROOM_WORLD,
    from,
    to,
    smartPathEnabled.value,
    hasObjectMap.value
  );
}

function rebuildRouteBySmartPathMode() {
  if (!targets.value.length) {
    rebuildMoveOverlay();
    return;
  }

  const lastTarget = targets.value[targets.value.length - 1]!;
  const columnStart = moveMode.value === "column"
    ? getColumnRouteStartPosByTarget(
      lastTarget.pos,
      movingUnits.value as BaseUnit[],
      { ignoreExistingMoveCommands: ignoreExistingMoveCommandsForPreview.value }
    )
    : null;
  const start =
    columnStart ??
    routeStartPos.value ??
    getNearestSelectedUnitPlannedPos(
      lastTarget.pos,
      movingUnits.value as BaseUnit[],
      { ignoreExistingMoveCommands: ignoreExistingMoveCommandsForPreview.value }
    ) ??
    lastTarget.pos;
  const rebuiltPoints = getSegmentRoutePoints(start, lastTarget.pos);

  targets.value = rebuiltPoints.map((point) => ({
    pos: point,
    modifier: lastTarget.modifier ?? null,
  }));
  rebuildMoveOverlay();
}

function onSmartPathToggle(nextValue: boolean) {
  if (!isAdmin.value) return;
  if (moveMode.value === "formation" || !hasObjectMap.value) return;
  smartPathEnabled.value = nextValue;
  window.CLIENT_SETTINGS[CLIENT_SETTING_KEYS.MOVE_SMART_PATH] = nextValue;
  rebuildRouteBySmartPathMode();
}

function enforceSmartPathAvailability() {
  if (hasObjectMap.value) return;
  if (!smartPathEnabled.value) return;
  smartPathEnabled.value = false;
  rebuildRouteBySmartPathMode();
}

type EnvMenuId = EnvironmentStateId | "none";

const envMenuOpen = ref(false);
const envMenuCenter = ref<vec2>({ x: 0, y: 0 });
const envMenuAnchorWorld = ref<vec2 | null>(null);
const envMenuAutoConfirm = ref(false);

let envMenuRaf: number | null = null;
let lastCamKey = "";

function updateEnvMenuCenter() {
  const anchor = envMenuAnchorWorld.value;
  if (!anchor) return;

  const cam = window.ROOM_WORLD.camera;
  const key = `${cam.pos.x.toFixed(2)}:${cam.pos.y.toFixed(2)}:${cam.zoom.toFixed(4)}:${anchor.x.toFixed(2)}:${anchor.y.toFixed(2)}`;
  if (key === lastCamKey) return;
  lastCamKey = key;

  envMenuCenter.value = cam.worldToScreen(anchor);
}

function startEnvMenuTracking() {
  if (envMenuRaf != null) return;
  const loop = () => {
    if (!envMenuOpen.value) {
      envMenuRaf = null;
      return;
    }
    updateEnvMenuCenter();
    envMenuRaf = requestAnimationFrame(loop);
  };
  envMenuRaf = requestAnimationFrame(loop);
}

function stopEnvMenuTracking() {
  if (envMenuRaf == null) return;
  cancelAnimationFrame(envMenuRaf);
  envMenuRaf = null;
}

function openEnvMenu(anchorWorld?: vec2, autoConfirmAfterPick = false) {
  const anchor = anchorWorld ?? targets.value[targets.value.length - 1]?.pos ?? null;
  if (!anchor) return;

  envMenuAutoConfirm.value = autoConfirmAfterPick;
  envMenuAnchorWorld.value = { x: anchor.x, y: anchor.y };
  lastCamKey = "";
  updateEnvMenuCenter();

  envMenuOpen.value = true;
  startEnvMenuTracking();
}

function closeEnvMenu() {
  envMenuOpen.value = false;
  envMenuAutoConfirm.value = false;
  stopEnvMenuTracking();
}

const envMenuCenterItem = computed<RadialMenuItem<EnvMenuId> | null>(() => {
  if (!targets.value.length) return null;
  const active = targets.value[targets.value.length - 1]!.modifier == null;
  return {
    id: "none",
    icon: "✖",
    label: t("clear"),
    active,
    ariaLabel: t("clear"),
  };
});

const envMenuItems = computed<RadialMenuItem<EnvMenuId>[]>(() => {
  const current = targets.value.length ? targets.value[targets.value.length - 1]!.modifier ?? null : null;
  return ROUTE_MODIFIERS.value.map((modifier) => ({
    id: modifier,
    icon: envIcon(modifier),
    label: t(`env.${modifier}`),
    active: current === modifier,
    ariaLabel: t(`env.${modifier}`),
  }));
});

function onEnvMenuSelect(item: RadialMenuItem<EnvMenuId>) {
  if (item.id === "none") {
    setRouteModifier(null);
    if (envMenuAutoConfirm.value) confirm();
    return;
  }
  setRouteModifier(item.id);
  if (envMenuAutoConfirm.value) confirm();
}

const selectedAbilities = ref<UnitAbilityType[]>([]);

function toggleAbility(ability: UnitAbilityType) {
  if (selectedAbilities.value.includes(ability)) {
    selectedAbilities.value = selectedAbilities.value.filter((item) => item !== ability);
    return;
  }
  selectedAbilities.value.push(ability);
}

const availableAbilities = computed<UnitAbilityType[]>(() => {
  const set = new Set<UnitAbilityType>();
  for (const unit of movingUnits.value) {
    for (const ability of unit.abilities) {
      if (hasAbilityInaccuracyRadius(ability)) continue;
      set.add(ability);
    }
  }
  return [...set];
});

function setMoveMode(mode: MoveMode) {
  if (moveMode.value === mode) return;
  moveMode.value = mode;
  if (mode === "formation") {
    smartPathEnabled.value = false;
  } else if (!isAdmin.value) {
    smartPathEnabled.value = hasObjectMap.value;
  }
  rebuildMoveOverlay();
}

const movePlan = computed(() => {
  if (!movingUnits.value.length || !targets.value.length) return [];
  return buildMovePlan(
    movingUnits.value as BaseUnit[],
    targets.value[0]!.pos,
    { ignoreExistingMoveCommands: ignoreExistingMoveCommandsForPreview.value }
  );
});

const formationCenter = computed<vec2 | null>(() => buildMoveFormationCenter(
  movingUnits.value as BaseUnit[],
  { ignoreExistingMoveCommands: ignoreExistingMoveCommandsForPreview.value }
));
const formationOffsets = computed<Record<string, vec2>>(() =>
  buildMoveFormationOffsets(
    movingUnits.value as BaseUnit[],
    formationCenter.value,
    { ignoreExistingMoveCommands: ignoreExistingMoveCommandsForPreview.value }
  )
);

const unitsGrouped = computed(() => groupUnitsByTypeAndTeam(movingUnits.value));

function applyContextTarget(pos: vec2, append: boolean) {
  if (!isPointInsideActiveZone(pos)) return;
  const nextTargets = buildContextRouteUpdate({
    mode: moveMode.value,
    pos,
    append,
    targets: targets.value,
    routeStartPos: routeStartPos.value,
    movingUnits: movingUnits.value as BaseUnit[],
    world: window.ROOM_WORLD,
    getSegmentRoutePoints,
    ignoreExistingMoveCommands: ignoreExistingMoveCommandsForPreview.value,
  });
  targets.value = nextTargets;

  if (append) {
    nextTick(() => {
      routeListRef.value?.scrollTo({ top: routeListRef.value.scrollHeight, behavior: "smooth" });
    });
  }

  rebuildMoveOverlay();
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 2) return;
  if ((event.target as HTMLElement)?.closest(".order-move")) return;

  event.stopPropagation();
  event.preventDefault();

  const pos = window.ROOM_WORLD.camera.screenToWorld({
    x: event.clientX,
    y: event.clientY,
  });

  applyContextTarget(pos, true);
  if (isAdmin.value) {
    openEnvMenu(undefined, false);
  }
}

function rebuildMoveOverlay() {
  const items = buildMoveOverlayItems({
    movingUnits: movingUnits.value as BaseUnit[],
    targets: targets.value,
    plan: movePlan.value,
    formationCenter: formationCenter.value,
    formationOffsets: formationOffsets.value,
    moveMode: moveMode.value,
    metersPerPixel: window.ROOM_WORLD?.map?.metersPerPixel ?? 1,
    roomWorld: window.ROOM_WORLD,
    smartPathEnabled: smartPathEnabled.value,
    hasObjectMap: hasObjectMap.value,
    renderExistingMoveCommands: !ignoreExistingMoveCommandsForPreview.value,
  });

  if (!items.length) {
    window.ROOM_WORLD.clearOverlay();
    return;
  }
  window.ROOM_WORLD.setOverlay(items);
}

function confirm() {
  if (!movingUnits.value.length || !targets.value.length) return;

  applyMoveOrder({
    movingUnits: movingUnits.value as BaseUnit[],
    routeTargets: [...targets.value],
    plan: movePlan.value,
    formationCenter: formationCenter.value,
    formationOffsets: formationOffsets.value,
    moveMode: moveMode.value,
    smartPathEnabled: smartPathEnabled.value,
    hasObjectMap: hasObjectMap.value,
    selectedAbilities: selectedAbilities.value,
    isPatrol: isPatrol.value,
    createUniqueId: () => crypto.randomUUID(),
    roomWorld: window.ROOM_WORLD,
    metersPerPixel: window.ROOM_WORLD?.map?.metersPerPixel ?? 1,
    playerTeam: window.PLAYER.team,
    emitDirectViewOrder: ({ team, unitId, commands }) => {
      window.ROOM_WORLD.events.emit("api", {
        type: "direct_view_send_order",
        team: team as any,
        data: {
          unitId,
          commands,
        },
      });
    },
  });

  closeEnvMenu();
  cleanup();
  window.ROOM_WORLD.events.emit("changed", { reason: "unit" });
}

function cleanup() {
  closeEnvMenu();
  movingUnits.value = [];
  targets.value = [];
  isPatrol.value = false;
  window.ROOM_WORLD.clearOverlay();
  emit("close");
}

let unsubscribe: unsub;

onMounted(() => {
  movingUnits.value = getMoveEligibleUnits(props.units);
  loadSmartPathPreference(movingUnits.value);
  enforceSmartPathAvailability();

  window.addEventListener("pointerdown", onPointerDown);
  unsubscribe = window.ROOM_WORLD.events.on("changed", ({ reason }) => {
    if (reason === "overlay" || reason === "animation" || reason === "camera") return;
    if (reason === "select") {
      const selectedUnits = window.ROOM_WORLD.units.list().filter((unit) => unit.selected);
      movingUnits.value = getMoveEligibleUnits(selectedUnits);
      if (!targets.value.length) {
        loadSmartPathPreference(movingUnits.value);
      }
    }
    enforceSmartPathAvailability();
    rebuildMoveOverlay();
  });
  window.INPUT.IGNORE_DRAG = true;
});

onUnmounted(() => {
  unsubscribe?.();
  movingUnits.value = [];
  targets.value = [];
  window.removeEventListener("pointerdown", onPointerDown);
  window.ROOM_WORLD.clearOverlay();
  window.INPUT.IGNORE_DRAG = false;
  stopEnvMenuTracking();
});

watch(hasObjectMap, () => {
  enforceSmartPathAvailability();
});

defineExpose({
  confirm,
  applyContextTarget,
  setMoveMode,
  openEnvMenu,
});
</script>

<template>
  <div class="order-move">
    <!-- ===== UNITS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.units') }}</div>
      <div class="cards">
        <div
          v-for="u in unitsGrouped"
          :key="u.type + u.team"
          class="card unit"
          :style="{ color: teamColor(u.team) }"
        >
          {{ t(`unit.${u.type}`) }} × {{ u.count }}
        </div>
      </div>
    </div>

    <div class="arrow">➜</div>

    <!-- ===== TARGETS ===== -->
    <div class="column">
      <div class="title">{{ t('tools.command.route') }}</div>

      <div v-if="!targets.length" class="hint">
        {{ t('tools.command.pickRouteHint') }}
      </div>

      <div
        v-else-if="movingUnits.length > 0"
        ref="routeListRef"
        class="target-pos route-list"
      >
        <div v-for="(t, i) in targets" :key="i">
          {{ i + 1 }}: {{ fmtMeters(routeDistancesMeters[i] ?? 0) }}
          <span v-if="t.modifier">{{ envIcon(t.modifier) }}</span>
        </div>
      </div>

      <label v-if="isAdmin && hasObjectMap" class="smart-path-toggle">
        <input
          type="checkbox"
          class="smart-path-toggle-input"
          :checked="smartPathEnabled && hasObjectMap && moveMode !== 'formation'"
          :disabled="moveMode === 'formation' || !hasObjectMap"
          @change="onSmartPathToggle(($event.target as HTMLInputElement).checked)"
        >
        <span class="smart-path-toggle-switch" aria-hidden="true"></span>
        <span class="smart-path-toggle-label">{{ t('tools.command.smartPath') }}</span>
      </label>
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

    <!-- ===== ENV MODIFIER ===== -->
    <RadialMenu
      :open="envMenuOpen"
      :center="envMenuCenter"
      :items="envMenuItems"
      :center-item="envMenuCenterItem"
      :show-labels="false"
      :close-on-backdrop="false"
      :close-on-esc="false"
      @select="(item) => onEnvMenuSelect(item)"
      @close="closeEnvMenu"
    />

    <!-- ===== ACTIONS ===== -->
    <div class="column actions">
      <button
        v-if="isAdmin"
        class="btn patrol"
        :class="{ active: isPatrol }"
        :disabled="!targets.length"
        @click="isPatrol = !isPatrol"
      >
        {{ t('tools.command.patrol') }}
      </button>
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
.order-move {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 8px 12px;
  background: #020617ee;
  border-top: 1px solid #334155;
  font-size: 11px;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.column.actions {
  justify-content: flex-end;
}

.title {
  color: #94a3b8;
  font-size: 10px;
}

.hint {
  font-size: 10px;
  color: #64748b;
  white-space: pre-line;
}

.target-pos {
  font-size: 10px;
  color: #38bdf8;
}

.target-pos.route-list {
  max-height: 120px;
  overflow-y: auto;
}

.smart-path-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #cbd5e1;
  user-select: none;
  cursor: pointer;
}

.smart-path-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.smart-path-toggle-switch {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid #334155;
  background: #0f172a;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.smart-path-toggle-switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #94a3b8;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.smart-path-toggle-input:checked + .smart-path-toggle-switch {
  background: rgba(56, 189, 248, 0.22);
  border-color: #38bdf8;
}

.smart-path-toggle-input:checked + .smart-path-toggle-switch::after {
  transform: translateX(12px);
  background: #38bdf8;
}

.smart-path-toggle-input:focus-visible + .smart-path-toggle-switch {
  outline: 2px solid rgba(56, 189, 248, 0.35);
  outline-offset: 2px;
}

.smart-path-toggle-label {
  color: #cbd5e1;
}

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

.arrow {
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 14px;
}

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

.btn.patrol {
  color: #38bdf8;
}

.btn.patrol.active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
}

.btn.cancel {
  color: #94a3b8;
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.radio {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #cbd5f5;
}

.radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #cbd5f5;
  cursor: pointer;
  user-select: none;
  align-self: flex-start;
}

.radio input {
  display: none;
}

/* круг */
.radio-ui {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid #475569;
  background: #020617;
  position: relative;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

/* точка внутри */
.radio-ui::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: transparent;
  transform: scale(0.4);
  opacity: 0;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

/* ===== FORMATION ===== */
.radio input:checked + .radio-ui.formation {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px #22c55e33;
}

.radio input:checked + .radio-ui.formation::after {
  background: #22c55e;
  transform: scale(1);
  opacity: 1;
}

/* hover */
.radio:hover .radio-ui {
  border-color: #94a3b8;
}

.env-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 12px;
  background: #020617ee;
  border-top: 1px solid #1e293b;
  pointer-events: auto;
}

.env-title {
  font-size: 10px;
  color: #94a3b8;
}

/* === 2 строки === */
.env-buttons.two-lines {
  display: grid;
  grid-template-columns: repeat(2, max-content);
  gap: 4px 6px;
}

.env-btn {
  font-size: 10px;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid #334155;
  background: #020617;
  color: #cbd5f5;
  cursor: pointer;

  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.env-btn.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
  color: #e5e7eb;
}

.env-btn.danger {
  color: #f87171;
}

.env-btn-icon {
  font-size: 11px;
  line-height: 1;
}

.env-btn-label {
  white-space: nowrap;
}

.column.abilities {
  min-width: 140px;
}

.card.ability {
  cursor: pointer;
  font-size: 10px;
  color: #94a3b8;
  user-select: none;
}

.card.ability:hover {
  border-color: #64748b;
}

.card.ability.active {
  color: #22c55e;
  border-color: #22c55e;
  background: #052e16;
}
</style>

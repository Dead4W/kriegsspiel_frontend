import type { world } from "@/engine/world/world.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { UnitAiTriggerState } from "@/engine";

type TriggerEventPayload = {
  unitId: string;
  triggerType: UnitAiTriggerState["type"];
  sourceMessageId: string | null;
  details?: Record<string, unknown>;
};

const previousHpByWorld = new WeakMap<world, Map<string, number>>();

function getPreviousHpMap(worldInstance: world): Map<string, number> {
  const existing = previousHpByWorld.get(worldInstance);
  if (existing) return existing;
  const created = new Map<string, number>();
  previousHpByWorld.set(worldInstance, created);
  return created;
}

function hasTriggerCooldown(trigger: UnitAiTriggerState): boolean {
  const cooldownSeconds = trigger.cooldownSeconds ?? 0;
  if (!Number.isFinite(cooldownSeconds) || cooldownSeconds <= 0) return false;
  const lastTriggeredAtMs = trigger.lastTriggeredAt ? Date.parse(trigger.lastTriggeredAt) : NaN;
  if (!Number.isFinite(lastTriggeredAtMs)) return false;
  const elapsedMs = Date.now() - lastTriggeredAtMs;
  return elapsedMs < cooldownSeconds * 1000;
}

function emitTrigger(worldInstance: world, payload: TriggerEventPayload) {
  worldInstance.events.emit("ai_trigger", payload);
}

function processOnEnemyDistanceTrigger(
  worldInstance: world,
  unit: BaseUnit,
  trigger: UnitAiTriggerState
): TriggerEventPayload | null {
  if (trigger.type !== "on_enemy_distance") return null;
  const directEnemies = worldInstance.units
    .getDirectView(unit)
    .filter((otherUnit) => otherUnit.team !== unit.team && otherUnit.alive);
  if (!directEnemies.length) return null;
  const metersPerPixel = Math.max(0.0001, Number(worldInstance.map.metersPerPixel) || 1);
  let nearestDistanceMeters = Infinity;
  for (const enemy of directEnemies) {
    const distanceMeters = Math.hypot(
      enemy.pos.x - unit.pos.x,
      enemy.pos.y - unit.pos.y
    ) * metersPerPixel;
    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters;
    }
  }
  if (!Number.isFinite(nearestDistanceMeters)) return null;
  if (nearestDistanceMeters > trigger.distanceMeters) return null;
  return {
    unitId: unit.id,
    triggerType: "on_enemy_distance",
    sourceMessageId: trigger.sourceMessageId ?? null,
    details: {
      directEnemyCount: directEnemies.length,
      nearestDistanceMeters,
      thresholdMeters: trigger.distanceMeters,
    },
  };
}

function processOnAttackedTrigger(
  unit: BaseUnit,
  trigger: UnitAiTriggerState,
  previousHp: number | undefined
): TriggerEventPayload | null {
  if (trigger.type !== "on_attacked") return null;
  const prevHp = (typeof previousHp === "number" && Number.isFinite(previousHp))
    ? previousHp
    : null;
  if (prevHp == null) return null;
  if (unit.hp >= prevHp) return null;
  return {
    unitId: unit.id,
    triggerType: "on_attacked",
    sourceMessageId: trigger.sourceMessageId ?? null,
    details: {
      hpBefore: prevHp,
      hpAfter: unit.hp,
    },
  };
}

export function processAiTriggers(worldInstance: world) {
  const previousHpMap = getPreviousHpMap(worldInstance);
  const nowIso = new Date().toISOString();
  const units = worldInstance.units.list();
  for (const unit of units) {
    if (!unit.alive) {
      previousHpMap.delete(unit.id);
      continue;
    }
    const triggers = unit.getAiTriggers();
    const previousHp = previousHpMap.get(unit.id);
    let didTrigger = false;
    for (let idx = 0; idx < triggers.length; idx += 1) {
      const trigger = triggers[idx]!;
      if (hasTriggerCooldown(trigger)) continue;
      const enemyDistancePayload = processOnEnemyDistanceTrigger(worldInstance, unit, trigger);
      const attackedPayload = processOnAttackedTrigger(unit, trigger, previousHp);
      const payload = enemyDistancePayload ?? attackedPayload;
      if (!payload) continue;
      emitTrigger(worldInstance, payload);
      didTrigger = true;
      unit.touchAiTrigger(idx, nowIso);
    }
    if (didTrigger) {
      unit.setDirty();
    }
    previousHpMap.set(unit.id, unit.hp);
  }
}

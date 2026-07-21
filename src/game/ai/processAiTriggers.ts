import type { world } from "@/engine/world/world.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { unitType, type UnitAiTriggerState } from "@/engine";
import { Team } from "@/enums/teamKeys.ts";

type TriggerEventPayload = {
  unitId: string;
  triggerType: string;
  sourceMessageId: string | null;
  details?: Record<string, unknown>;
};

const previousVisibleEnemiesByWorld = new WeakMap<world, Map<string, Set<string>>>();

function getPreviousVisibleEnemiesMap(worldInstance: world): Map<string, Set<string>> {
  const existing = previousVisibleEnemiesByWorld.get(worldInstance);
  if (existing) return existing;
  const created = new Map<string, Set<string>>();
  previousVisibleEnemiesByWorld.set(worldInstance, created);
  return created;
}

function emitTrigger(worldInstance: world, payload: TriggerEventPayload) {
  worldInstance.events.emit("ai_trigger", payload);
}

function resolveLatestDeliveredMessageId(unit: BaseUnit): string | null {
  const messages = unit.messages
    .filter((message) => (
      message.author_team === Team.RED || message.author_team === Team.BLUE
    ))
    .sort((a, b) => a.time.localeCompare(b.time))
  return messages[messages.length - 1]?.id ?? null
}

function processAtGameTimeTrigger(
  worldInstance: world,
  unit: BaseUnit,
  trigger: UnitAiTriggerState,
): TriggerEventPayload | null {
  if (trigger.type !== "at_game_time" || trigger.fired) return null
  const currentGameTimeMs = Date.parse(String(worldInstance.time).replace(" ", "T"))
  const targetGameTimeMs = Date.parse(String(trigger.atGameTime).replace(" ", "T"))
  if (!Number.isFinite(currentGameTimeMs) || !Number.isFinite(targetGameTimeMs)) return null
  if (currentGameTimeMs < targetGameTimeMs) return null
  return {
    unitId: unit.id,
    triggerType: "at_game_time",
    sourceMessageId: trigger.sourceMessageId ?? null,
    details: {
      atGameTime: trigger.atGameTime,
      currentGameTime: worldInstance.time,
    },
  }
}

export function processAiTriggers(worldInstance: world) {
  const previousVisibleEnemiesMap = getPreviousVisibleEnemiesMap(worldInstance)
  const units = worldInstance.units.list();
  for (const unit of units) {
    const attackDamage = unit.consumeAttackDamage()
    if (
      !unit.alive
      || unit.type === unitType.GENERAL
      || unit.type === unitType.MESSENGER
      || unit.isRetreat
    ) {
      if (unit.alive && unit.isRetreat) {
        previousVisibleEnemiesMap.set(unit.id, new Set(
          worldInstance.units
            .getDirectView(unit)
            .filter((otherUnit) => otherUnit.team !== unit.team && otherUnit.alive)
            .map((enemy) => enemy.id)
        ))
      } else {
        previousVisibleEnemiesMap.delete(unit.id)
      }
      continue;
    }
    const sourceMessageId = resolveLatestDeliveredMessageId(unit)
    if (attackDamage) {
      emitTrigger(worldInstance, {
        unitId: unit.id,
        triggerType: "on_attacked",
        sourceMessageId,
        details: {
          hpBefore: attackDamage.hpBefore,
          hpAfter: attackDamage.hpAfter,
          attackerIds: attackDamage.attackerIds,
        },
      })
    }

    const directEnemies = worldInstance.units
      .getDirectView(unit)
      .filter((otherUnit) => otherUnit.team !== unit.team && otherUnit.alive)
    const currentVisibleEnemyIds = new Set(directEnemies.map((enemy) => enemy.id))
    const previousVisibleEnemyIds = previousVisibleEnemiesMap.get(unit.id) ?? new Set<string>()
    const newlyVisibleEnemies = directEnemies.filter((enemy) => !previousVisibleEnemyIds.has(enemy.id))
    if (newlyVisibleEnemies.length) {
      emitTrigger(worldInstance, {
        unitId: unit.id,
        triggerType: "on_enemy_seen",
        sourceMessageId,
        details: {
          enemyIds: newlyVisibleEnemies.map((enemy) => enemy.id),
          directEnemyCount: directEnemies.length,
        },
      })
    }

    const triggers = unit.getAiTriggers();
    let didTrigger = false;
    for (let idx = 0; idx < triggers.length; idx += 1) {
      const trigger = triggers[idx]!;
      const payload = processAtGameTimeTrigger(worldInstance, unit, trigger)
      if (!payload) continue;
      emitTrigger(worldInstance, payload);
      didTrigger = true;
      unit.touchAiTrigger(idx);
    }
    if (didTrigger) {
      unit.setDirty();
    }
    previousVisibleEnemiesMap.set(unit.id, currentVisibleEnemyIds)
  }
}

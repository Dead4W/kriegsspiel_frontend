import type { world } from "@/engine/world/world.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { unitType } from "@/engine/units/types.ts";
import { Team } from "@/enums/teamKeys.ts";
import { createUnitTrigger } from "./index.ts";
import type { TriggerContext, TriggerEventPayload } from "./types.ts";
import { UnitTriggerTypes } from "./UnitTriggerTypes.ts";

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
    .sort((a, b) => a.time.localeCompare(b.time));
  return messages[messages.length - 1]?.id ?? null;
}

function isEligibleUnit(unit: BaseUnit): boolean {
  return unit.alive
    && unit.type !== unitType.GENERAL
    && unit.type !== unitType.MESSENGER
    && !unit.isRetreat;
}

function visibleEnemiesFor(worldInstance: world, unit: BaseUnit): BaseUnit[] {
  return worldInstance.units
    .getDirectView(unit)
    .filter((otherUnit) => otherUnit.team !== unit.team && otherUnit.alive);
}

function rememberVisibleEnemies(
  previousVisibleEnemiesMap: Map<string, Set<string>>,
  unit: BaseUnit,
  enemyIds: Iterable<string>,
) {
  previousVisibleEnemiesMap.set(unit.id, new Set(enemyIds));
}

export function processUnitTriggers(worldInstance: world) {
  const previousVisibleEnemiesMap = getPreviousVisibleEnemiesMap(worldInstance);
  const currentGameTime = String(worldInstance.time ?? "");
  const currentGameTimeMs = Date.parse(currentGameTime.replace(" ", "T"));

  for (const unit of worldInstance.units.list()) {
    const attackDamage = unit.consumeAttackDamage();
    const visibleEnemies = visibleEnemiesFor(worldInstance, unit);
    const currentVisibleEnemyIds = new Set(visibleEnemies.map((enemy) => enemy.id));

    if (!isEligibleUnit(unit)) {
      if (unit.alive && unit.isRetreat) {
        rememberVisibleEnemies(previousVisibleEnemiesMap, unit, currentVisibleEnemyIds);
      } else {
        previousVisibleEnemiesMap.delete(unit.id);
      }
      continue;
    }

    const previousVisibleEnemyIds = previousVisibleEnemiesMap.get(unit.id) ?? new Set<string>();
    const newlyVisibleEnemies = visibleEnemies.filter((enemy) => !previousVisibleEnemyIds.has(enemy.id));
    const ctx: TriggerContext = {
      world: worldInstance,
      unit,
      currentGameTime,
      currentGameTimeMs,
      sourceMessageId: resolveLatestDeliveredMessageId(unit),
      attackDamage,
      visibleEnemies,
      newlyVisibleEnemies,
    };

    let didTrigger = false;
    const installed = unit.getTriggerObjects();
    const installedTypes = new Set(installed.map((trigger) => trigger.type));
    const triggers = [
      ...installedTypes.has(UnitTriggerTypes.OnEnemy)
        ? []
        : [createUnitTrigger({ type: UnitTriggerTypes.OnEnemy })],
      ...installedTypes.has(UnitTriggerTypes.OnAttacked)
        ? []
        : [createUnitTrigger({ type: UnitTriggerTypes.OnAttacked })],
      ...installed,
    ];
    for (const trigger of triggers) {
      const payload = trigger.evaluate(ctx);
      if (!payload) continue;
      emitTrigger(worldInstance, payload);
      trigger.markFired();
      didTrigger = true;
    }
    if (didTrigger) unit.setDirty();
    rememberVisibleEnemies(previousVisibleEnemiesMap, unit, currentVisibleEnemyIds);
  }
}

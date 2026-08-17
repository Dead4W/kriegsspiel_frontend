import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { uuid } from "@/engine/units/types.ts";
import type { world } from "@/engine/world/world.ts";
import { UnitTriggerTypes, type UnitTriggerType } from "./UnitTriggerTypes.ts";

export type TriggerEventPayload = {
  unitId: string;
  triggerType: UnitTriggerType;
  sourceMessageId: string | null;
  details?: Record<string, unknown>;
};

export type TriggerAttackDamage = {
  hpBefore: number;
  hpAfter: number;
  attackerIds: uuid[];
};

export type TriggerContext = {
  world: world;
  unit: BaseUnit;
  currentGameTime: string;
  currentGameTimeMs: number;
  sourceMessageId: string | null;
  attackDamage: TriggerAttackDamage | null;
  visibleEnemies: BaseUnit[];
  newlyVisibleEnemies: BaseUnit[];
};

type TriggerSource = {
  sourceMessageId?: uuid | null;
};

export type AtGameTimeTriggerState = TriggerSource & {
  type: typeof UnitTriggerTypes.AtGameTime;
  atGameTime: string;
  fired?: boolean;
};

export type PeriodicTriggerState = TriggerSource & {
  type: typeof UnitTriggerTypes.Periodic;
};

export type OnEnemyTriggerState = TriggerSource & {
  type: typeof UnitTriggerTypes.OnEnemy;
};

export type OnAttackedTriggerState = TriggerSource & {
  type: typeof UnitTriggerTypes.OnAttacked;
};

export type UnitTriggerState =
  | AtGameTimeTriggerState
  | PeriodicTriggerState
  | OnEnemyTriggerState
  | OnAttackedTriggerState;

export type UnitAiTriggerState = UnitTriggerState;

function parseGameTimeMs(value: unknown): number {
  return Date.parse(String(value ?? "").replace(" ", "T"));
}

function readType(raw: Record<string, unknown>): string {
  return String(raw.type ?? "").trim().toLowerCase();
}

export function normalizeUnitTriggerState(
  raw: unknown,
  sourceMessageId: string | null = null,
): UnitTriggerState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const type = readType(record);
  const resolvedSource = String(record.sourceMessageId ?? sourceMessageId ?? "").trim() || null;

  if (type === UnitTriggerTypes.AtGameTime) {
    const atGameTime = String(record.atGameTime ?? "").trim();
    if (!atGameTime || !Number.isFinite(parseGameTimeMs(atGameTime))) return null;
    return {
      type: UnitTriggerTypes.AtGameTime,
      atGameTime,
      sourceMessageId: resolvedSource,
      fired: Boolean(record.fired),
    };
  }

  if (type === UnitTriggerTypes.Periodic) {
    return {
      type: UnitTriggerTypes.Periodic,
      sourceMessageId: resolvedSource,
    };
  }

  if (type === UnitTriggerTypes.OnEnemy || type === "on_enemy_seen") {
    return {
      type: UnitTriggerTypes.OnEnemy,
      sourceMessageId: resolvedSource,
    };
  }

  if (type === UnitTriggerTypes.OnAttacked) {
    return {
      type: UnitTriggerTypes.OnAttacked,
      sourceMessageId: resolvedSource,
    };
  }

  return null;
}

export function normalizeUnitTriggerStates(
  raw: unknown,
  sourceMessageId: string | null = null,
): UnitTriggerState[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const triggers: UnitTriggerState[] = [];
  for (const item of raw) {
    const trigger = normalizeUnitTriggerState(item, sourceMessageId);
    if (!trigger) continue;
    const key = trigger.type === UnitTriggerTypes.AtGameTime
      ? `${trigger.type}:${trigger.atGameTime}`
      : trigger.type;
    if (seen.has(key)) continue;
    seen.add(key);
    triggers.push(trigger);
  }
  return triggers;
}

export function unitHasTrigger(
  triggers: readonly UnitTriggerState[] | null | undefined,
  type: UnitTriggerType,
): boolean {
  return (triggers ?? []).some((trigger) => trigger.type === type);
}

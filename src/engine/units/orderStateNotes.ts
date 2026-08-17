import { BaseUnit } from "@/engine/units/baseUnit.ts";
import {
  normalizeUnitTriggerStates,
  type UnitTriggerState,
} from "@/engine/units/triggers";

function parseBooleanNote(notes: unknown, prefix: string): boolean | null {
  if (!Array.isArray(notes)) return null;
  for (const noteRaw of notes) {
    const note = String(noteRaw ?? "").trim().toLowerCase();
    if (!note.startsWith(prefix)) continue;
    const value = note.slice(prefix.length).trim();
    if (value === "on" || value === "true" || value === "1") return true;
    if (value === "off" || value === "false" || value === "0") return false;
  }
  return null;
}

function parseAutoAttack(notes: unknown): boolean | null {
  return parseBooleanNote(notes, "set_autoattack:");
}

function parsePeriodicBatch(notes: unknown): boolean | null {
  return parseBooleanNote(notes, "set_periodic_batch:");
}

export type UnitOrderStateNotes = {
  autoAttack: boolean | null;
  periodicBatch: boolean | null;
  triggers: {
    hasDirective: boolean;
    items: UnitTriggerState[];
  };
};

/**
 * On-unit state an order sets alongside its commands.
 *
 * This is the structured form of what used to travel only as prefixed note
 * strings. Notes are still read, so orders written before this field existed
 * keep working, but an author with a choice should use this: reading behaviour
 * out of free text means a typo silently becomes no order at all.
 */
export type UnitOrderState = {
  autoAttack?: boolean;
  periodicBatch?: boolean;
  /**
   * Replaces the unit's trigger list. An empty array clears them; the
   * field being absent leaves them alone.
   */
  triggers?: Array<{ type: string; atGameTime?: string }>;
};

function parseTriggersNote(notes: unknown, sourceMessageId: string): UnitOrderStateNotes["triggers"] {
  if (!Array.isArray(notes)) {
    return { hasDirective: false, items: [] };
  }
  let hasDirective = false;
  const items: UnitTriggerState[] = [];
  for (const noteRaw of notes) {
    const note = String(noteRaw ?? "").trim();
    if (!note.startsWith("set_ai_triggers:")) continue;
    hasDirective = true;
    let rawTriggers: unknown = [];
    try {
      rawTriggers = JSON.parse(note.slice("set_ai_triggers:".length));
    } catch {
      rawTriggers = [];
    }
    items.push(...normalizeUnitTriggerStates(rawTriggers, sourceMessageId));
  }
  return { hasDirective, items };
}

export function readUnitOrderStateNotes(
  notes: unknown,
  sourceMessageId: string,
): UnitOrderStateNotes {
  return {
    autoAttack: parseAutoAttack(notes),
    periodicBatch: parsePeriodicBatch(notes),
    triggers: parseTriggersNote(notes, sourceMessageId),
  };
}

/**
 * The state an order plan sets, from the structured field where it is given
 * and from the notes otherwise. The structured field wins wherever both speak.
 */
export function readUnitOrderState(
  state: UnitOrderState | null | undefined,
  notes: unknown,
  sourceMessageId: string,
): UnitOrderStateNotes {
  const fromNotes = readUnitOrderStateNotes(notes, sourceMessageId);
  if (!state || typeof state !== "object") return fromNotes;

  return {
    autoAttack: typeof state.autoAttack === "boolean" ? state.autoAttack : fromNotes.autoAttack,
    periodicBatch: typeof state.periodicBatch === "boolean" ? state.periodicBatch : fromNotes.periodicBatch,
    triggers: Array.isArray(state.triggers)
      ? { hasDirective: true, items: normalizeUnitTriggerStates(state.triggers, sourceMessageId) }
      : fromNotes.triggers,
  };
}

export function applyUnitOrderStateNotes(
  unit: BaseUnit,
  orderState: UnitOrderStateNotes,
): boolean {
  if (orderState.autoAttack != null) unit.setAutoAttack(orderState.autoAttack);
  if (orderState.triggers.hasDirective) {
    unit.setTriggers(orderState.triggers.items);
  } else if (orderState.periodicBatch != null) {
    unit.setPeriodicBatch(orderState.periodicBatch);
  }
  return orderState.autoAttack != null
    || orderState.triggers.hasDirective
    || orderState.periodicBatch != null;
}

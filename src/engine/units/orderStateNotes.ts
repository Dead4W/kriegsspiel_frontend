import { BaseUnit } from "@/engine/units/baseUnit.ts";
import type { UnitAiTriggerState } from "@/engine/units/types.ts";

function parseAutoAttack(notes: unknown): boolean | null {
  if (!Array.isArray(notes)) return null;
  for (const noteRaw of notes) {
    const note = String(noteRaw ?? "").trim().toLowerCase();
    if (!note.startsWith("set_autoattack:")) continue;
    const value = note.slice("set_autoattack:".length).trim();
    if (value === "on" || value === "true" || value === "1") return true;
    if (value === "off" || value === "false" || value === "0") return false;
  }
  return null;
}

export type UnitOrderStateNotes = {
  autoAttack: boolean | null;
  aiTriggers: {
    hasDirective: boolean;
  triggers: UnitAiTriggerState[];
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
  /**
   * Replaces the unit's scheduled triggers. An empty array clears them; the
   * field being absent leaves them alone.
   */
  triggers?: Array<{ type: string; atGameTime?: string }>;
};

function readTriggers(
  raw: UnitOrderState["triggers"],
  sourceMessageId: string,
): UnitAiTriggerState[] {
  const triggers: UnitAiTriggerState[] = [];
  for (const trigger of raw ?? []) {
    if (!trigger || typeof trigger !== "object") continue;
    if (trigger.type !== "at_game_time") continue;
    const atGameTime = String(trigger.atGameTime ?? "").trim();
    if (!atGameTime || !Number.isFinite(Date.parse(atGameTime.replace(" ", "T")))) continue;
    triggers.push({ type: "at_game_time", atGameTime, sourceMessageId, fired: false });
  }
  return triggers;
}

function parseAiTriggers(notes: unknown, sourceMessageId: string): UnitOrderStateNotes["aiTriggers"] {
  if (!Array.isArray(notes)) {
    return { hasDirective: false, triggers: [] };
  }
  const triggers: UnitAiTriggerState[] = [];
  let hasDirective = false;
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
    if (!Array.isArray(rawTriggers)) continue;
    for (const rawTrigger of rawTriggers) {
      if (!rawTrigger || typeof rawTrigger !== "object") continue;
      const trigger = rawTrigger as Record<string, unknown>;
      if (String(trigger.type ?? "").toLowerCase() !== "at_game_time") continue;
      const atGameTime = String(trigger.atGameTime ?? "").trim();
      if (!atGameTime || !Number.isFinite(Date.parse(atGameTime.replace(" ", "T")))) continue;
      triggers.push({
        type: "at_game_time",
        atGameTime,
        sourceMessageId,
        fired: false,
      });
    }
  }
  return { hasDirective, triggers };
}

export function readUnitOrderStateNotes(
  notes: unknown,
  sourceMessageId: string,
): UnitOrderStateNotes {
  const autoAttack = parseAutoAttack(notes);
  const aiTriggers = parseAiTriggers(notes, sourceMessageId);
  return { autoAttack, aiTriggers };
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
    aiTriggers: Array.isArray(state.triggers)
      ? { hasDirective: true, triggers: readTriggers(state.triggers, sourceMessageId) }
      : fromNotes.aiTriggers,
  };
}

export function applyUnitOrderStateNotes(
  unit: BaseUnit,
  orderState: UnitOrderStateNotes,
): boolean {
  if (orderState.autoAttack != null) unit.setAutoAttack(orderState.autoAttack);
  if (orderState.aiTriggers.hasDirective) unit.setAiTriggers(orderState.aiTriggers.triggers);
  return orderState.autoAttack != null || orderState.aiTriggers.hasDirective;
}

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

export function applyUnitOrderStateNotes(
  unit: BaseUnit,
  orderState: UnitOrderStateNotes,
): boolean {
  if (orderState.autoAttack != null) unit.setAutoAttack(orderState.autoAttack);
  if (orderState.aiTriggers.hasDirective) unit.setAiTriggers(orderState.aiTriggers.triggers);
  return orderState.autoAttack != null || orderState.aiTriggers.hasDirective;
}

import type { RetreatTimeInput } from "./types";

export function normalizeRetreatTime(input: RetreatTimeInput): RetreatTimeInput {
  const nextHours = Number.isFinite(input.hours) ? Math.max(0, Math.floor(input.hours)) : 0;
  const nextMinutes = Number.isFinite(input.minutes) ? Math.max(0, Math.floor(input.minutes)) : 0;

  return {
    hours: nextHours,
    minutes: Math.min(59, nextMinutes),
  };
}

export function getRetreatDurationSeconds(input: RetreatTimeInput): number {
  const normalized = normalizeRetreatTime(input);
  return normalized.hours * 60 * 60 + normalized.minutes * 60;
}

export function getRetreatDurationMinutes(input: RetreatTimeInput): number {
  const normalized = normalizeRetreatTime(input);
  return normalized.hours * 60 + normalized.minutes;
}

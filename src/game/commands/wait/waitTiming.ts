import type { WaitTimeInput } from "./types";

export function normalizeWaitTime(input: WaitTimeInput): WaitTimeInput {
  const nextMinutes = Number.isFinite(input.minutes) ? Math.max(0, Math.floor(input.minutes)) : 0;
  const nextSeconds = Number.isFinite(input.seconds) ? Math.max(0, Math.floor(input.seconds)) : 0;

  return {
    minutes: nextMinutes,
    seconds: Math.min(59, nextSeconds),
  };
}

export function getWaitDurationSeconds(input: WaitTimeInput): number {
  const normalized = normalizeWaitTime(input);
  return normalized.minutes * 60 + normalized.seconds;
}

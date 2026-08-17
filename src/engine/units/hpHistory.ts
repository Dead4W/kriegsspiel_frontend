export const HP_HISTORY_WINDOW_SECONDS = 10 * 60
export const HP_LOSS_WINDOW_SECONDS = 5 * 60

export type UnitHpHistorySample = {
  t: number
  hp: number
}

export function worldTimeToMs(time: string): number {
  const ms = new Date(time.replace(' ', 'T')).getTime()
  return Number.isFinite(ms) ? ms : 0
}

export function normalizeHpHistory(raw: unknown): UnitHpHistorySample[] {
  if (!Array.isArray(raw)) return []
  const out: UnitHpHistorySample[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const t = Number((item as { t?: unknown }).t)
    const hp = Number((item as { hp?: unknown }).hp)
    if (!Number.isFinite(t) || !Number.isFinite(hp)) continue
    out.push({ t, hp })
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

function ensureHistory(history: UnitHpHistorySample[] | undefined | null): UnitHpHistorySample[] {
  return Array.isArray(history) ? history : []
}

/**
 * Records HP at `atMs`. A plateau keeps the time HP actually changed and a
 * trailing "still this HP" point. Moving the change timestamp forward would
 * smear a hit across the idle time after combat.
 */
export function upsertHpSample(
  history: UnitHpHistorySample[],
  atMs: number,
  hp: number,
): UnitHpHistorySample[] {
  if (!Number.isFinite(atMs) || !Number.isFinite(hp)) return history

  while (history.length && history[history.length - 1]!.t > atMs) {
    history.pop()
  }

  const last = history[history.length - 1]
  if (!last) {
    history.push({ t: atMs, hp })
    return history
  }
  if (last.t === atMs) {
    last.hp = hp
    return history
  }
  if (last.hp === hp) {
    const prev = history[history.length - 2]
    if (prev && prev.hp === hp) {
      last.t = atMs
    } else {
      history.push({ t: atMs, hp })
    }
    return history
  }
  history.push({ t: atMs, hp })
  return history
}

export function pruneHpHistory(
  history: UnitHpHistorySample[],
  nowMs: number,
  windowSeconds = HP_HISTORY_WINDOW_SECONDS,
): UnitHpHistorySample[] {
  if (!history.length || !Number.isFinite(nowMs)) return history
  const minT = nowMs - Math.max(0, windowSeconds) * 1000
  let lastBefore = -1
  for (let i = 0; i < history.length; i++) {
    if (history[i]!.t < minT) lastBefore = i
    else break
  }
  if (lastBefore > 0) history.splice(0, lastBefore)
  return history
}

export function interpolateHpAt(
  history: UnitHpHistorySample[],
  targetMs: number,
  currentHp: number,
  currentMs: number,
): number {
  const stored = ensureHistory(history)
  const last = stored[stored.length - 1]
  const samples = (!last || last.t < currentMs || last.hp !== currentHp)
    ? [...stored, { t: currentMs, hp: currentHp }]
    : stored

  if (!Number.isFinite(targetMs) || targetMs >= currentMs) return currentHp

  const first = samples[0]!
  if (targetMs <= first.t) return first.hp

  for (let i = 1; i < samples.length; i++) {
    const next = samples[i]!
    if (next.t < targetMs) continue
    const prev = samples[i - 1]!
    const span = next.t - prev.t
    if (span <= 0) return next.hp
    const ratio = (targetMs - prev.t) / span
    return prev.hp + (next.hp - prev.hp) * ratio
  }

  return currentHp
}

export function readReportedHpLost5min(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function formatHpLostShort(lost: number, minutes = HP_LOSS_WINDOW_SECONDS / 60): string | null {
  if (!Number.isFinite(lost) || lost <= 0) return null
  const rounded = lost >= 10 ? Math.round(lost) : Math.round(lost * 10) / 10
  if (rounded <= 0) return null
  return `-${rounded}/${minutes}m`
}

export function hpLostOverSeconds(
  history: UnitHpHistorySample[],
  currentHp: number,
  currentMs: number,
  lookbackSeconds = HP_LOSS_WINDOW_SECONDS,
): number {
  const hpThen = interpolateHpAt(
    history,
    currentMs - Math.max(0, lookbackSeconds) * 1000,
    currentHp,
    currentMs,
  )
  return Math.max(0, hpThen - currentHp)
}

export function anchorUnitHpHistory(
  unit: { hp: number; hpHistory: UnitHpHistorySample[] },
  atMs: number,
): void {
  if (!Array.isArray(unit.hpHistory)) unit.hpHistory = []
  upsertHpSample(unit.hpHistory, atMs, unit.hp)
}

export function recordUnitHpHistory(
  unit: { hp: number; hpHistory: UnitHpHistorySample[] },
  atMs: number,
  windowSeconds = HP_HISTORY_WINDOW_SECONDS,
): void {
  if (!Array.isArray(unit.hpHistory)) unit.hpHistory = []
  upsertHpSample(unit.hpHistory, atMs, unit.hp)
  pruneHpHistory(unit.hpHistory, atMs, windowSeconds)
}

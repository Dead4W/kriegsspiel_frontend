import { getResourcePack, type ResourcePack } from '@/engine/assets/resourcepack'

export type MessengerLogicConfig = {
  spawnHpDelta: number
  returnHpDelta: number
  enemyKillChancePerTick: number
}

const DEFAULT: MessengerLogicConfig = {
  spawnHpDelta: -1,
  returnHpDelta: 1,
  enemyKillChancePerTick: 0.1,
}

function normalizeChance(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT.enemyKillChancePerTick
  return Math.max(0, Math.min(1, n))
}

function normalizeDelta(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.round(n)
}

export function getMessengerLogicConfig(pack: ResourcePack | null = getResourcePack()): MessengerLogicConfig {
  const raw = pack?.messengerLogic
  if (!raw || typeof raw !== 'object') return DEFAULT
  const rawRecord = raw as Record<string, unknown>
  return {
    spawnHpDelta: normalizeDelta(rawRecord.spawnHpDelta, DEFAULT.spawnHpDelta),
    returnHpDelta: normalizeDelta(rawRecord.returnHpDelta, DEFAULT.returnHpDelta),
    enemyKillChancePerTick: normalizeChance(rawRecord.enemyKillChancePerTick),
  }
}


import { getResourcePack, type ResourcePack } from '@/engine/assets/resourcepack'

export type MoraleOutcomeId = 'pass' | 'retreat' | 'flee' | 'disband'

export type MoraleCheckConfig = {
  dice: { count: number; sides: number }
  commander: { radiusMeters: number; penalty: number }
  lossPenalties: Array<{ lossesMoreThan: number; penalty: number; key: string }>
  outcomes: Array<{ minTotal: number; id: MoraleOutcomeId }>
  effects: { retreatDurationSeconds: number; fleeDurationMultiplier: number; fleeHpMultiplier: number }
}

const DEFAULT: MoraleCheckConfig = {
  dice: { count: 2, sides: 6 },
  commander: { radiusMeters: 300, penalty: -2 },
  lossPenalties: [
    { lossesMoreThan: 0.25, penalty: -2, key: 'losses>25%' },
    { lossesMoreThan: 0.35, penalty: -1, key: 'losses>35%' },
    { lossesMoreThan: 0.5, penalty: -2, key: 'losses>50%' },
  ],
  outcomes: [
    { minTotal: 0, id: 'pass' },
    { minTotal: -2, id: 'retreat' },
    { minTotal: -5, id: 'flee' },
    { minTotal: -9999, id: 'disband' },
  ],
  effects: { retreatDurationSeconds: 60 * 60 * 12, fleeDurationMultiplier: 2, fleeHpMultiplier: 0.5 },
}

function asOutcomeId(v: unknown): MoraleOutcomeId | null {
  const s = String(v ?? '')
  if (s === 'pass' || s === 'retreat' || s === 'flee' || s === 'disband') return s
  return null
}

export function getMoraleCheckConfig(pack: ResourcePack | null = getResourcePack()): MoraleCheckConfig {
  const raw = (pack as any)?.moraleCheck
  if (!raw || typeof raw !== 'object') return DEFAULT

  const dice = (raw as any).dice
  const commander = (raw as any).commander
  const effects = (raw as any).effects
  const lossPenalties = Array.isArray((raw as any).lossPenalties) ? (raw as any).lossPenalties : null
  const outcomes = Array.isArray((raw as any).outcomes) ? (raw as any).outcomes : null

  const count = Number((dice as any)?.count)
  const sides = Number((dice as any)?.sides)
  const radiusMeters = Number((commander as any)?.radiusMeters)
  const commanderPenalty = Number((commander as any)?.penalty)

  const retreatDurationSeconds = Number((effects as any)?.retreatDurationSeconds)
  const fleeDurationMultiplier = Number((effects as any)?.fleeDurationMultiplier)
  const fleeHpMultiplier = Number((effects as any)?.fleeHpMultiplier)

  const normalizedLossPenalties = (lossPenalties ?? [])
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any) => ({
      lossesMoreThan: Number(x.lossesMoreThan),
      penalty: Number(x.penalty),
      key: typeof x.key === 'string' ? String(x.key) : '',
    }))
    .filter((x: any) => Number.isFinite(x.lossesMoreThan) && Number.isFinite(x.penalty))
    .map((x: number) => ({
      lossesMoreThan: x.lossesMoreThan,
      penalty: x.penalty,
      key: x.key || `losses>${Math.round(x.lossesMoreThan * 100)}%`,
    }))

  const normalizedOutcomes = (outcomes ?? [])
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any) => ({
      minTotal: Number(x.minTotal),
      id: asOutcomeId(x.id),
    }))
    .filter((x) => Number.isFinite(x.minTotal) && x.id)
    .map((x) => ({ minTotal: x.minTotal, id: x.id as MoraleOutcomeId }))

  return {
    dice: {
      count: Number.isFinite(count) ? Math.max(1, Math.floor(count)) : DEFAULT.dice.count,
      sides: Number.isFinite(sides) ? Math.max(2, Math.floor(sides)) : DEFAULT.dice.sides,
    },
    commander: {
      radiusMeters: Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : DEFAULT.commander.radiusMeters,
      penalty: Number.isFinite(commanderPenalty) ? commanderPenalty : DEFAULT.commander.penalty,
    },
    lossPenalties: normalizedLossPenalties.length ? normalizedLossPenalties : DEFAULT.lossPenalties,
    outcomes: normalizedOutcomes.length ? normalizedOutcomes : DEFAULT.outcomes,
    effects: {
      retreatDurationSeconds: Number.isFinite(retreatDurationSeconds)
        ? Math.max(0, retreatDurationSeconds)
        : DEFAULT.effects.retreatDurationSeconds,
      fleeDurationMultiplier: Number.isFinite(fleeDurationMultiplier)
        ? Math.max(0, fleeDurationMultiplier)
        : DEFAULT.effects.fleeDurationMultiplier,
      fleeHpMultiplier: Number.isFinite(fleeHpMultiplier) ? Math.max(0, fleeHpMultiplier) : DEFAULT.effects.fleeHpMultiplier,
    },
  }
}


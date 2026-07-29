import {
  getResourcePack,
  isObject,
  type ResourcePack,
  toFiniteNumber,
} from '@/engine/assets/resourcepack'
import { clamp } from '@/engine/math'
import { memoizeByPack } from '@/engine/resourcePack/memo'

export type FatigueConfig = {
  max: number
  attackHoursPerPoint: number
  moveHoursPerPoint: number
  recoveryPerHour: number
  attackedRecoveryMultiplier: number
  damageCurvePower: number
  minDamageMultiplier: number
  speedThresholds: Array<{
    moreThan: number
    multiplier: number
  }>
}

const DEFAULT_FATIGUE_CONFIG: FatigueConfig = {
  max: 10,
  attackHoursPerPoint: 1,
  moveHoursPerPoint: 0.5,
  recoveryPerHour: 1,
  attackedRecoveryMultiplier: 0.5,
  damageCurvePower: 1,
  minDamageMultiplier: 0.4,
  speedThresholds: [
    { moreThan: 5, multiplier: 0.8 },
    { moreThan: 8, multiplier: 0.6 },
  ],
}

function positiveNumber(raw: unknown, fallback: number): number {
  const value = toFiniteNumber(raw)
  return value != null && value > 0 ? value : fallback
}

export function getFatigueConfig(
  pack: ResourcePack | null = getResourcePack(),
): FatigueConfig {
  return fatigueConfigByPack(pack)
}

const fatigueConfigByPack = memoizeByPack((pack): FatigueConfig => {
  const raw = pack?.fatigue
  if (!isObject(raw)) return {
    ...DEFAULT_FATIGUE_CONFIG,
    speedThresholds: [...DEFAULT_FATIGUE_CONFIG.speedThresholds],
  }

  const thresholdsRaw = Array.isArray(raw.speedThresholds) ? raw.speedThresholds : []
  const speedThresholds = thresholdsRaw
    .filter(isObject)
    .map((threshold) => ({
      moreThan: toFiniteNumber(threshold.moreThan),
      multiplier: toFiniteNumber(threshold.multiplier),
    }))
    .filter((threshold): threshold is { moreThan: number; multiplier: number } =>
      threshold.moreThan != null && threshold.multiplier != null && threshold.multiplier >= 0,
    )
    .sort((a, b) => b.moreThan - a.moreThan)

  return {
    max: positiveNumber(raw.max, DEFAULT_FATIGUE_CONFIG.max),
    attackHoursPerPoint: positiveNumber(raw.attackHoursPerPoint, DEFAULT_FATIGUE_CONFIG.attackHoursPerPoint),
    moveHoursPerPoint: positiveNumber(raw.moveHoursPerPoint, DEFAULT_FATIGUE_CONFIG.moveHoursPerPoint),
    recoveryPerHour: Math.max(0, toFiniteNumber(raw.recoveryPerHour) ?? DEFAULT_FATIGUE_CONFIG.recoveryPerHour),
    attackedRecoveryMultiplier: Math.max(
      0,
      toFiniteNumber(raw.attackedRecoveryMultiplier) ?? DEFAULT_FATIGUE_CONFIG.attackedRecoveryMultiplier,
    ),
    damageCurvePower: positiveNumber(raw.damageCurvePower, DEFAULT_FATIGUE_CONFIG.damageCurvePower),
    minDamageMultiplier: clamp(
      toFiniteNumber(raw.minDamageMultiplier) ?? DEFAULT_FATIGUE_CONFIG.minDamageMultiplier,
      0,
      1,
    ),
    speedThresholds: speedThresholds.length ? speedThresholds : [...DEFAULT_FATIGUE_CONFIG.speedThresholds],
  }
})

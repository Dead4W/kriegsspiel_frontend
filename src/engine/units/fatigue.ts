import { clamp } from '@/engine/math'
import { getFatigueConfig } from '@/engine/resourcePack/fatigue'
import { getEnvironmentNumberParam } from '@/engine/resourcePack/environment'
import { getFormationMultipliers } from '@/engine/resourcePack/formations'
import { getUnitNumberParam } from '@/engine/resourcePack/units'
import { getAbilityMultipliers } from '@/engine/units/modifiers/UnitAbilityModifiers'
import type { BaseUnit } from '@/engine/units/baseUnit'
import type { FormationType } from '@/engine/units/types'

export type FatigueStep = {
  didMove: boolean
  isAttacking: boolean
  moveAbilityIds?: string[]
  attackAbilityIds?: string[]
  /**
   * Charge the formation named here rather than the one the unit is in. Lets
   * the cost of a march be priced before the order to adopt that formation is
   * sent, which is the only moment the choice can still be made.
   */
  formation?: FormationType
}

function multiplyEnvironmentParam(unit: BaseUnit, key: string): number {
  return unit.envState.reduce((total, state) => {
    const value = getEnvironmentNumberParam(state, key)
    return value != null && value >= 0 ? total * value : total
  }, 1)
}

function getAbilityFatigueMultiplier(unit: BaseUnit, abilityIds: string[] | undefined): number {
  if (!abilityIds?.length) return 1
  const activeAbility = [...abilityIds].reverse().find((ability) => unit.abilities.includes(ability))
  return activeAbility ? getAbilityMultipliers()[activeAbility]?.fatigue ?? 1 : 1
}

function getAccumulationMultiplier(
  unit: BaseUnit,
  abilityIds?: string[],
  formation?: FormationType,
): number {
  const unitMultiplier = getUnitNumberParam(unit.type, 'fatigueAccumMult') ?? 1
  const formationMultiplier = getFormationMultipliers()[formation ?? unit.getEffectiveFormation()]?.fatigue ?? 1
  const abilityMultiplier = getAbilityFatigueMultiplier(unit, abilityIds)
  return Math.max(0, unitMultiplier)
    * Math.max(0, formationMultiplier)
    * Math.max(0, abilityMultiplier)
    * multiplyEnvironmentParam(unit, 'fatigueAccumMult')
}

function getRecoveryMultiplier(unit: BaseUnit): number {
  const unitMultiplier = getUnitNumberParam(unit.type, 'fatigueRecoveryMult') ?? 1
  return Math.max(0, unitMultiplier) * multiplyEnvironmentParam(unit, 'fatigueRecoveryMult')
}

/**
 * How much tiredness a stretch of time spent this way costs, or gives back
 * when it is negative. Separate from applying it, so that the same arithmetic
 * can answer what a unit's state *will* be without making it so.
 */
export function fatigueDelta(unit: BaseUnit, dtSeconds: number, step: FatigueStep): number {
  const config = getFatigueConfig()
  const hours = Math.max(0, dtSeconds) / 3600
  if (hours <= 0) return 0

  let delta = 0
  if (step.isAttacking) {
    delta += hours / config.attackHoursPerPoint
      * getAccumulationMultiplier(unit, step.attackAbilityIds, step.formation)
  }
  if (step.didMove) {
    delta += hours / config.moveHoursPerPoint
      * getAccumulationMultiplier(unit, step.moveAbilityIds, step.formation)
  }

  if (!step.didMove && !step.isAttacking && !unit.isRetreat) {
    const attackedMultiplier = unit.hasPendingAttackDamage()
      ? config.attackedRecoveryMultiplier
      : 1
    delta -= hours * config.recoveryPerHour * attackedMultiplier * getRecoveryMultiplier(unit)
  }

  return delta
}

/** What tiredness does to what a unit hits for. */
export function fatigueDamageMultiplier(fatigue: number): number {
  const config = getFatigueConfig()
  const level = clamp(fatigue, 0, config.max)
  return Math.max(
    config.minDamageMultiplier,
    1 - Math.pow(level / config.max, config.damageCurvePower),
  )
}

/** What tiredness does to how fast it gets anywhere. */
export function fatigueSpeedMultiplier(fatigue: number): number {
  const config = getFatigueConfig()
  const level = clamp(fatigue, 0, config.max)
  return config.speedThresholds.find((entry) => level > entry.moreThan)?.multiplier ?? 1
}

export function updateUnitFatigue(unit: BaseUnit, dtSeconds: number, step: FatigueStep): void {
  const config = getFatigueConfig()
  const delta = fatigueDelta(unit, dtSeconds, step)
  if (delta === 0) return

  const next = clamp(unit.fatigue + delta, 0, config.max)
  if (next !== unit.fatigue) {
    unit.fatigue = next
    unit.setDirty()
  }
}

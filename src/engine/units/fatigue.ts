import { clamp } from '@/engine/math'
import { getFatigueConfig } from '@/engine/resourcePack/fatigue'
import { getEnvironmentNumberParam } from '@/engine/resourcePack/environment'
import { getFormationMultipliers } from '@/engine/resourcePack/formations'
import { getUnitNumberParam } from '@/engine/resourcePack/units'
import { getAbilityMultipliers } from '@/engine/units/modifiers/UnitAbilityModifiers'
import type { BaseUnit } from '@/engine/units/baseUnit'

type FatigueStep = {
  didMove: boolean
  isAttacking: boolean
  moveAbilityIds?: string[]
  attackAbilityIds?: string[]
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

function getAccumulationMultiplier(unit: BaseUnit, abilityIds?: string[]): number {
  const unitMultiplier = getUnitNumberParam(unit.type, 'fatigueAccumMult') ?? 1
  const formationMultiplier = getFormationMultipliers()[unit.getEffectiveFormation()]?.fatigue ?? 1
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

export function updateUnitFatigue(unit: BaseUnit, dtSeconds: number, step: FatigueStep): void {
  const config = getFatigueConfig()
  const hours = Math.max(0, dtSeconds) / 3600
  if (hours <= 0) return

  let delta = 0
  if (step.isAttacking) {
    delta += hours / config.attackHoursPerPoint * getAccumulationMultiplier(unit, step.attackAbilityIds)
  }
  if (step.didMove) {
    delta += hours / config.moveHoursPerPoint * getAccumulationMultiplier(unit, step.moveAbilityIds)
  }

  if (!step.didMove && !step.isAttacking && !unit.isRetreat) {
    const attackedMultiplier = unit.hasPendingAttackDamage()
      ? config.attackedRecoveryMultiplier
      : 1
    delta -= hours * config.recoveryPerHour * attackedMultiplier * getRecoveryMultiplier(unit)
  }

  const next = clamp(unit.fatigue + delta, 0, config.max)
  if (next !== unit.fatigue) {
    unit.fatigue = next
    unit.setDirty()
  }
}

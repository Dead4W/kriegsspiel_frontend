import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {BaseCommand} from "./baseCommand.ts";
import {unitType, type uuid} from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import {
  ARTILLERY_DISTANCE_MODIFIERS, DISTANCE_MODIFIERS,
  getUnitDistanceModifier
} from "@/engine/units/modifiers/UnitDistanceModifier.ts";
import type {UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";
import {
  getDamageModifierByHeights
} from "@/engine/units/modifiers/UnitHeightModifier.ts";

export interface AttackCommandState {
  targets: uuid[]
  damageModifier: number
  abilities: UnitAbilityType[]
}

export class AttackCommand extends BaseCommand<
  UnitCommandTypes.Attack,
  AttackCommandState
> {
  readonly type: UnitCommandTypes.Attack = UnitCommandTypes.Attack

  readonly PRIORITY_TARGETS = 3

  constructor(private state: AttackCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    const ARTILLERY_IGNORE_ENVS = [
      UnitEnvironmentState.InForest,
      UnitEnvironmentState.InHouse,
      UnitEnvironmentState.InCoverHouse,
      UnitEnvironmentState.InCoverTrenches,
      UnitEnvironmentState.InWater,
    ];

    if (this.isFinished(unit)) return

    const targets = this.getPriorityTargets(unit)
    if (targets.length === 0) return

    unit.activateAbility(null)
    for (const ability of this.state.abilities) {
      if (unit.abilities.includes(ability)) {
        unit.activateAbility(ability)
      }
    }

    const percentHp = unit.hp / unit.stats.maxHp
    const baseDmg =
      (
        unit.damage
        * percentHp
        * this.state.damageModifier
        * (dt / 60)
      ) / targets.length

    for (const target of targets) {
      let unitDmg = baseDmg
      const formula: string[] = []

      formula.push(`stat.damage(${unit.stats.damage.toFixed(2)})`)
      const statModifiers = unit.getStatModifierInfo('damage')
      for (const statModifierSource of statModifiers.sources) {
        if (statModifierSource.multiplier !== 1) {
          formula.push(`${statModifierSource.type}.${statModifierSource.state}(${statModifierSource.multiplier})`)
        }
      }
      if (percentHp !== 1) {
        formula.push(`hp(${percentHp.toFixed(2)})`)
      }
      if (this.state.damageModifier && this.state.damageModifier !== 1) {
        formula.push(`attackCommandModifier(${this.state.damageModifier})`)
      }
      formula.push(`minutes(${dt/60})`)
      if (targets.length > 1) {
        formula.push(`÷ countTargets(${targets.length})`)
      }

      /* ===== Артиллерия / окружение ===== */

      if (unit.type === unitType.ARTILLERY) {
        for (const env of ARTILLERY_IGNORE_ENVS) {
          if (target.envState.includes(env)) {
            unitDmg *= 2
            formula.push(`ignoreEnvArtillery(${env})×2`)
          }
        }
      }

      /* ===== Дистанция ===== */

      const dx = target.pos.x - unit.pos.x
      const dy = target.pos.y - unit.pos.y
      const distance =
        Math.sqrt(dx * dx + dy * dy)
        * window.ROOM_WORLD.map.metersPerPixel

      const distanceModifier = getUnitDistanceModifier(
        unit.type === unitType.ARTILLERY
          ? ARTILLERY_DISTANCE_MODIFIERS
          : DISTANCE_MODIFIERS,
        distance,
      )

      unitDmg *= distanceModifier
      formula.push(`dist(${distance.toFixed(1)}m)×${distanceModifier.toFixed(2)}`)

      /* ===== Высота ===== */
      if (unit.type !== unitType.ARTILLERY) {
        const heightModifier = getDamageModifierByHeights(
          unit.height ?? 0,
          target.height ?? 0,
          distance,
        )

        unitDmg *= heightModifier
        if (heightModifier !== 1) {
          formula.push(
            `height(${(unit.height ?? 0)}→${(target.height ?? 0)})×${heightModifier.toFixed(2)}`
          )
        }
      }

      /* ===== Применение урона ===== */

      const unitDmgAfterDefense = target.takeDamage(unitDmg)

      const defenseModifier =
        unitDmg > 0
          ? unitDmgAfterDefense / unitDmg
          : 1

      if (defenseModifier !== 1) {
        formula.push(`def(${defenseModifier.toFixed(2)})`)
      }

      /* ===== ЛОГ ===== */
      window.ROOM_WORLD.logs.value.push({
        id: Date.now() + Math.random(),
        time: window.ROOM_WORLD.time,
        tokens: [
          { t: 'unit', u: unit.id },
          { t: 'i18n', v: `tools.logs.attack` },
          { t: 'unit', u: target.id },
          { t: 'i18n', v: `stat.damage` },
          { t: 'number', v: unitDmgAfterDefense },
          { t: 'text', v: ' (' },
          { t: 'formula', v: formula.join(' × ') },
          { t: 'text', v: ')' },
        ]
      })
    }
  }

  isFinished(unit: BaseUnit): boolean {
    return this.getPriorityTargets(unit).length === 0
  }

  estimate(unit: BaseUnit): number {
    return Infinity
  }

  /**
   * Все валидные цели в радиусе атаки
   */
  getActiveTargets(unit: BaseUnit): BaseUnit[] {
    return this.state.targets
      .map(id => window.ROOM_WORLD.units.get(id))
      .filter((u): u is BaseUnit => !!u && u.alive)
      .filter(u => {
        const dx = u.pos.x - unit.pos.x
        const dy = u.pos.y - unit.pos.y
        return dx * dx + dy * dy <= unit.attackRange * unit.attackRange
      })
  }

  getPriorityTargets(unit: BaseUnit): BaseUnit[] {
    let activeTargets = this.getActiveTargets(unit)
      .sort((a, b) => {
        const dxA = a.pos.x - unit.pos.x
        const dyA = a.pos.y - unit.pos.y
        const dxB = b.pos.x - unit.pos.x
        const dyB = b.pos.y - unit.pos.y

        return (dxA * dxA + dyA * dyA) - (dxB * dxB + dyB * dyB)
      })
    if (unit.type !== unitType.GATLING && unit.type !== unitType.ARTILLERY) {
      activeTargets = activeTargets.slice(0, this.PRIORITY_TARGETS)
    }
    return activeTargets
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state
    }
  }
}

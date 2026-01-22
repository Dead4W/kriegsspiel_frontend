import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {BaseCommand} from "./baseCommand.ts";
import {unitType, type uuid, type vec2} from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import {
  ARTILLERY_DISTANCE_MODIFIERS, DISTANCE_MODIFIERS,
  getUnitDistanceModifier
} from "@/engine/units/modifiers/UnitDistanceModifier.ts";
import {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import {
  getDamageModifierByHeights
} from "@/engine/units/modifiers/UnitHeightModifier.ts";
import {computeInaccuracyRadius} from "@/engine/units/modifiers/UnitInaccuracyModifier.ts";
import {ROOM_SETTING_KEYS} from "@/enums/roomSettingsKeys.ts";

export interface AttackCommandState {
  targets: uuid[]
  damageModifier: number
  abilities: UnitAbilityType[]
  inaccuracyPoint: vec2 | null
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

    let targets: BaseUnit[];

    unit.activateAbility(null)
    for (const ability of this.state.abilities) {
      if (unit.abilities.includes(ability)) {
        unit.activateAbility(ability)
      }
    }

    const percentHp = unit.hp / unit.stats.maxHp
    let baseDmg =
      (
        unit.damage
        * percentHp
        * this.state.damageModifier
        * (dt / 60)
      )

    let isInaccuracyFire = unit.type === unitType.ARTILLERY &&
      this.state.abilities.includes(UnitAbilityType.INACCURACY_FIRE) &&
      this.state.inaccuracyPoint;

    if (isInaccuracyFire) {
      targets = this.getUnitsInInaccuracyRadius(unit)
    } else {
      targets = this.getPriorityTargets(unit);
      if (targets.length === 0) return;
    }
    baseDmg /= targets.length;

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
        id: crypto.randomUUID(),
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
        ],
        is_new: true,
      })
    }

    unit.ammo -= dt / 60 / 60
  }

  isFinished(unit: BaseUnit): boolean {
    if (window.ROOM_SETTINGS[ROOM_SETTING_KEYS.LIMITED_AMMO]) {
      if (unit.ammo <= 0) {
        return true;
      }
    }
    return this.getPriorityTargets(unit).length === 0 && !this.state.inaccuracyPoint
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

  getUnitsInInaccuracyRadius(unit: BaseUnit): BaseUnit[] {
    const inaccuracyRadius = computeInaccuracyRadius(unit, this.state.inaccuracyPoint!)
    const radiusPx = inaccuracyRadius / window.ROOM_WORLD.map.metersPerPixel
    const r2 = radiusPx * radiusPx

    return window.ROOM_WORLD.units
      .list()
      .filter(u => u.alive)
      .filter(u => {
        const dx = u.pos.x - this.state.inaccuracyPoint!.x
        const dy = u.pos.y - this.state.inaccuracyPoint!.y
        return dx * dx + dy * dy <= r2
      })
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state
    }
  }
}

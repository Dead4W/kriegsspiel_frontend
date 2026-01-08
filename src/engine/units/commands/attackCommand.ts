import type {BaseUnit} from "@/engine/units/baseUnit.ts";
import {BaseCommand} from "./baseCommand.ts";
import {unitType, type uuid} from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {UnitEnvironmentState} from "@/engine/units/enums/UnitStates.ts";
import {
  ARTILLERY_DISTANCE_MODIFIERS, DISTANCE_MODIFIERS,
  getUnitDistanceModifier
} from "@/engine/units/enums/UnitDistanceModifier.ts";

export interface AttackCommandState {
  targets: uuid[]
  damageModifier: number
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

    const percentHp = unit.hp / unit.stats.maxHp;
    let dmg =
      (
        unit.damage
        * percentHp
        * this.state.damageModifier
        / (60) * dt
      )
      / targets.length

    for (const target of targets) {
      let unitDmg = dmg;

      if (unit.type === unitType.ARTILLERY) {
        for (const env of ARTILLERY_IGNORE_ENVS) {
          // TODO: Проверка на дальную атаку
          if (target.envState.includes(env)) {
            unitDmg *= 2;
          }
        }
      }

      const dx = target.pos.x - unit.pos.x
      const dy = target.pos.y - unit.pos.y
      const distance = Math.sqrt(dx * dx + dy * dy) * window.ROOM_WORLD.map.metersPerPixel
      const distanceModifier = getUnitDistanceModifier(
        unit.type === unitType.ARTILLERY ? ARTILLERY_DISTANCE_MODIFIERS : DISTANCE_MODIFIERS,
        distance,
      );
      unitDmg *= distanceModifier;

      target.takeDamage(unitDmg)
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
    return this.getActiveTargets(unit)
      .sort((a, b) => {
        const dxA = a.pos.x - unit.pos.x
        const dyA = a.pos.y - unit.pos.y
        const dxB = b.pos.x - unit.pos.x
        const dyB = b.pos.y - unit.pos.y

        return (dxA * dxA + dyA * dyA) - (dxB * dxB + dyB * dyB)
      })
      .slice(0, this.PRIORITY_TARGETS)
  }

  getState() {
    return {
      type: this.type,
      status: this.status,
      state: this.state
    }
  }
}

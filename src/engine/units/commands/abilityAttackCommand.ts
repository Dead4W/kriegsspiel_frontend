// units/commands/abilityAttackCommand.ts
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { BaseCommand } from "./baseCommand.ts";
import type { uuid } from "@/engine";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";

export interface AbilityAttackCommandState {
  targets: uuid[]
  damageModifier: number
  abilityId: string
}

export class AbilityAttackCommand extends BaseCommand<
  UnitCommandTypes.AbilityAttack,
  AbilityAttackCommandState
> {
  readonly type: UnitCommandTypes.AbilityAttack =
    UnitCommandTypes.AbilityAttack

  readonly PRIORITY_TARGETS = 3

  constructor(private state: AbilityAttackCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    if (this.isFinished(unit)) return

    const targets = this.getPriorityTargets(unit)
    if (targets.length === 0) return

    const dmg = (unit.damage * this.state.damageModifier / (60 * 60) & dt) / targets.length

    for (const target of targets) {
      target.takeDamage(dmg)
    }
  }

  isFinished(unit: BaseUnit): boolean {
    return this.getPriorityTargets(unit).length === 0
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

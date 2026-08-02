import type {vec2} from "@/engine/types.ts";
import {BaseUnit} from "@/engine/units/baseUnit.ts";
import {BaseCommand, CommandStatus} from "./baseCommand.ts";
import {UnitCommandTypes} from "@/engine/units/enums/UnitCommandTypes.ts";
import {unitType, type uuid} from "@/engine";
import type {UnitAbilityType} from "@/engine/units/modifiers/UnitAbilityModifiers.ts";
import { applyAutoEnvironment } from "@/engine/units/autoEnvironment.ts";
import { estimateMoveSeconds } from "@/engine/units/commands/moveEstimate.ts";

export interface MoveCommandState {
  target: vec2
  modifier: string | null
  comment?: string
  abilities: UnitAbilityType[]
  orderIndex: number
  uniqueId: uuid
  segIndex?: number
  isPatrol: boolean
}

export class MoveCommand extends BaseCommand<
  UnitCommandTypes.Move,
  MoveCommandState
> {
  readonly type = UnitCommandTypes.Move

  constructor(private state: MoveCommandState) {
    super()
  }

  private applyStateToUnit(unit: BaseUnit) {
    if (unit.manualEnvironment) {
      unit.envState = [unit.manualEnvironment]
      unit.activateAbility(null)
      for (const ability of this.state.abilities) {
        if (unit.abilities.includes(ability)) {
          unit.activateAbility(ability)
        }
      }
      return
    }

    if (!applyAutoEnvironment(unit, "moving")) {
      if (this.state.modifier) {
        unit.envState = [this.state.modifier]
      }
    }

    unit.activateAbility(null)
    for (const ability of this.state.abilities) {
      if (unit.abilities.includes(ability)) {
        unit.activateAbility(ability)
      }
    }
  }

  update(unit: BaseUnit, dt: number) {
    if (this.isFinished(unit)) {
      unit.activateAbility(null)
      return
    }
    this.applyStateToUnit(unit)
    if (!this.canMove(unit)) return

    const dx = this.state.target.x - unit.pos.x
    const dy = this.state.target.y - unit.pos.y
    const dist = Math.hypot(dx, dy)
    if (dist === 0) return

    // Compared against the step rather than against `estimate`: the estimate
    // prices the whole leg, ground and tiredness ahead included, while a step
    // can only be walked at the pace the unit holds right now.
    const stepPx = unit.speed / 60 * dt / window.ROOM_WORLD.map.metersPerPixel
    if (dist <= stepPx) {
      unit.move({
        x: this.state.target.x,
        y: this.state.target.y,
      })
    } else {
      unit.move({
        x: unit.pos.x + (dx / dist) * stepPx,
        y: unit.pos.y + (dy / dist) * stepPx,
      })
    }

    if (this.isFinished(unit)) {
      unit.activateAbility(null)
    }
  }

  private canMove(unit: BaseUnit): boolean {
    if (unit.type === unitType.MESSENGER) return true;

    const units = window.ROOM_WORLD.units.list()

    const collisionUnits = units.filter(other =>
      other.id !== unit.id
      && other.type !== unitType.MESSENGER
      && Math.hypot(
        other.pos.x - unit.pos.x,
        other.pos.y - unit.pos.y
      ) <= BaseUnit.COLLISION_RANGE_METERS / window.ROOM_WORLD.map.metersPerPixel
    )

    if (collisionUnits.length === 0) return true

    const selfFirst = unit.getCommands()[0]!

    for (const other of collisionUnits) {
      const otherFirst = other.getCommands()[0]!

      if (
        selfFirst &&
        otherFirst &&
        selfFirst.type === UnitCommandTypes.Move &&
        otherFirst.type === UnitCommandTypes.Move
      ) {
        const selfState = selfFirst.getState().state as MoveCommandState
        const otherState = otherFirst.getState().state as MoveCommandState

        if (selfState.uniqueId !== otherState.uniqueId) {
          if (selfState.orderIndex === 0 && otherState.orderIndex > 0) {
            if (selfState.uniqueId < otherState.uniqueId) {
              return false;
            }
          }
        }

        if (selfState.uniqueId === otherState.uniqueId && selfState.orderIndex > otherState.orderIndex) {
          // Если в одной колонне - пропускаем по orderIndex
          return false;
        }
      }
    }

    return true;
  }

  isFinished(unit: BaseUnit): boolean {
    const dx = this.state.target.x - unit.pos.x
    const dy = this.state.target.y - unit.pos.y
    return Math.hypot(dx, dy) <= 1
  }

  estimate(unit: BaseUnit, startPos: vec2 = unit.pos): number {
    return estimateMoveSeconds(unit, {
      startPos,
      target: this.state.target,
      modifier: this.state.modifier,
      abilities: this.state.abilities,
    })
  }

  getState(): { type: UnitCommandTypes.Move; status: CommandStatus; state: MoveCommandState } {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

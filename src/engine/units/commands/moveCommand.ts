import type { vec2 } from "@/engine/types.ts";
import { BaseUnit } from "@/engine/units/baseUnit.ts";
import {BaseCommand, CommandStatus} from "./baseCommand.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import { UnitEnvironmentState } from "@/engine/units/enums/UnitStates.ts";
import type {uuid} from "@/engine";
import type {UnitAbilityType} from "@/engine/units/abilities/baseAbility.ts";

export interface MoveCommandState {
  target: vec2
  modifier: UnitEnvironmentState | null
  abilities: UnitAbilityType[]
  orderIndex: number
  uniqueId: uuid
}

export class MoveCommand extends BaseCommand<
  UnitCommandTypes.Move,
  MoveCommandState
> {
  readonly type = UnitCommandTypes.Move

  constructor(private state: MoveCommandState) {
    super()
  }

  update(unit: BaseUnit, dt: number) {
    if (this.isFinished(unit)) return
    if (!this.canMove(unit)) return

    const dx = this.state.target.x - unit.pos.x
    const dy = this.state.target.y - unit.pos.y
    const dist = Math.hypot(dx, dy)
    if (dist === 0) return

    // Activate env
    unit.envState = []
    if (this.state.modifier) {
      unit.envState = [this.state.modifier]
    }

    // Activate ability
    unit.activateAbility(null)
    for (const ability of this.state.abilities) {
      if (unit.abilities.includes(ability)) {
        unit.activateAbility(ability)
      }
    }

    const speed = unit.speed / 60 * dt / window.ROOM_WORLD.map.metersPerPixel
    if (this.estimate(unit) <= dt) {
      unit.move({
        x: this.state.target.x,
        y: this.state.target.y,
      })
    } else {
      unit.move({
        x: unit.pos.x + (dx / dist) * speed,
        y: unit.pos.y + (dy / dist) * speed,
      })
    }
  }

  private canMove(unit: BaseUnit): boolean {
    const units = window.ROOM_WORLD.units.list()

    const collisionUnits = units.filter(other =>
      other.id !== unit.id &&
      Math.hypot(
        other.pos.x - unit.pos.x,
        other.pos.y - unit.pos.y
      ) <= BaseUnit.COLLISION_RANGE
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
    // save values
    const saveEnv = [...unit.envState]
    const saveAbilityType = unit.activeAbilityType

    unit.envState = []
    if (this.state.modifier) {
      unit.envState = [this.state.modifier]
    }
    unit.activeAbilityType = null
    for (const ability of this.state.abilities) {
      if (unit.abilities.includes(ability)) {
        unit.activeAbilityType = ability
      }
    }

    const unitSpeed = unit.speed

    // restore values
    unit.envState = saveEnv
    unit.activeAbilityType = saveAbilityType

    const dx = this.state.target.x - unit.pos.x
    const dy = this.state.target.y - unit.pos.y
    const dist = Math.hypot(dx, dy)

    return Math.ceil(dist / (unitSpeed / 60) * window.ROOM_WORLD.map.metersPerPixel)
  }

  getState(): { type: UnitCommandTypes.Move; status: CommandStatus; state: MoveCommandState } {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

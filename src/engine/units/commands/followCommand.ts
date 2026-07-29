import { BaseCommand, CommandStatus } from './baseCommand.ts'
import type { BaseUnit } from '@/engine/units/baseUnit.ts'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes.ts'
import { MoveCommand, type MoveCommandState } from '@/engine/units/commands/moveCommand.ts'
import type { uuid } from '@/engine/units/types.ts'
import { buildRoadTurnRoutePoints } from '@/engine/world/roadPath.ts'

export interface FollowCommandState {
  targets: uuid[]
  distanceMeters: number
  targetId?: uuid | null
  completed?: boolean
}

export class FollowCommand extends BaseCommand<UnitCommandTypes.Follow, FollowCommandState> {
  static readonly FOLLOW_MOVE_COMMENT = '#follow#'

  readonly type: UnitCommandTypes.Follow = UnitCommandTypes.Follow

  constructor(private state: FollowCommandState) {
    super()
  }

  static isFollowMoveComment(comment: unknown): boolean {
    return typeof comment === 'string' && comment.includes(FollowCommand.FOLLOW_MOVE_COMMENT)
  }

  private getFollowDistancePx(): number {
    return (
      Math.max(0, this.state.distanceMeters) /
      Math.max(0.0001, window.ROOM_WORLD.map.metersPerPixel)
    )
  }

  private distanceTo(unit: BaseUnit, target: BaseUnit): number {
    return Math.hypot(target.pos.x - unit.pos.x, target.pos.y - unit.pos.y)
  }

  private resolveTarget(unit: BaseUnit): BaseUnit | null {
    const targets = this.state.targets
      .map((id) => window.ROOM_WORLD.units.get(id))
      .filter((target): target is BaseUnit => Boolean(
        target?.alive
        && !target.isRetreat
        && target.id !== unit.id,
      ))
    if (!targets.length) return null

    const target = targets
      .slice()
      .sort((a, b) => this.distanceTo(unit, a) - this.distanceTo(unit, b))[0]!
    this.state.targetId = target.id
    return target
  }

  private hasPendingFollowMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move || command.isFinished(unit)) return false
      const moveState = command.getState().state as MoveCommandState
      return FollowCommand.isFollowMoveComment(moveState.comment)
    })
  }

  private hasPendingRegularMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move || command.isFinished(unit)) return false
      const moveState = command.getState().state as MoveCommandState
      return !FollowCommand.isFollowMoveComment(moveState.comment)
    })
  }

  private removeFollowMoves(unit: BaseUnit) {
    unit.setCommands(
      unit.getCommands().filter((command) => {
        if (command.type !== UnitCommandTypes.Move) return true
        const moveState = command.getState().state as MoveCommandState
        return !FollowCommand.isFollowMoveComment(moveState.comment)
      }),
    )
  }

  private getApproachPoint(unit: BaseUnit, target: BaseUnit) {
    const distance = this.distanceTo(unit, target)
    const followDistance = this.getFollowDistancePx()
    if (distance <= followDistance || distance === 0) return { ...unit.pos }

    const factor = (distance - followDistance) / distance
    return {
      x: unit.pos.x + (target.pos.x - unit.pos.x) * factor,
      y: unit.pos.y + (target.pos.y - unit.pos.y) * factor,
    }
  }

  private ensureFollowMoves(unit: BaseUnit, target: BaseUnit) {
    if (this.hasPendingRegularMove(unit) || this.hasPendingFollowMove(unit)) return
    if (this.distanceTo(unit, target) <= this.getFollowDistancePx()) return

    const approachPoint = this.getApproachPoint(unit, target)
    const routePoints = buildRoadTurnRoutePoints(window.ROOM_WORLD, unit.pos, approachPoint, {
      allowDirectFallback: false,
    })
    const movePoints = routePoints.length ? routePoints : [approachPoint]
    const uniqueId = crypto.randomUUID()
    const moves = movePoints.map(
      (point, segIndex) =>
        new MoveCommand({
          target: { x: point.x, y: point.y },
          modifier: null,
          comment: FollowCommand.FOLLOW_MOVE_COMMENT,
          abilities: [],
          orderIndex: 0,
          uniqueId,
          segIndex,
          isPatrol: false,
        }),
    )
    unit.setCommands([...unit.getCommands(), ...moves])
  }

  update(unit: BaseUnit, dt: number) {
    void dt
    const target = this.resolveTarget(unit)
    if (!target) {
      this.removeFollowMoves(unit)
      this.state.completed = true
      return
    }

    if (this.distanceTo(unit, target) <= this.getFollowDistancePx()) {
      this.removeFollowMoves(unit)
      return
    }
    this.ensureFollowMoves(unit, target)
  }

  isFinished(): boolean {
    return Boolean(this.state.completed)
  }

  estimate(): number {
    return Infinity
  }

  getState(): { type: UnitCommandTypes.Follow; status: CommandStatus; state: FollowCommandState } {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}

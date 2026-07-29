  import { BaseCommand, CommandStatus } from "./baseCommand.ts";
import type { BaseUnit } from "@/engine/units/baseUnit.ts";
import { UnitCommandTypes } from "@/engine/units/enums/UnitCommandTypes.ts";
import { MoveCommand, type MoveCommandState } from "@/engine/units/commands/moveCommand.ts";
import { unitType } from "@/engine/units/types.ts";
import type { vec2 } from "@/engine/types.ts";
import { buildRoadTurnRoutePoints } from "@/engine/world/roadPath.ts";

export interface RetreatCommandState {
  elapsed: number
  duration: number
  comment?: string
  routeThreatSignature?: string
}

export class RetreatCommand extends BaseCommand<
  UnitCommandTypes.Retreat,
  RetreatCommandState
> {
  readonly type: UnitCommandTypes.Retreat = UnitCommandTypes.Retreat
  private static readonly RETREAT_MOVE_COMMENT = '__retreat_move__'
  private static readonly RETREAT_THREAT_RADIUS_METERS = 1000

  constructor(private state: RetreatCommandState) {
    super()
  }

  private getThreatZones(unit: BaseUnit): Array<{ x: number; y: number; radiusPx: number }> {
    const radiusPx = RetreatCommand.RETREAT_THREAT_RADIUS_METERS
      / Math.max(0.0001, window.ROOM_WORLD.map.metersPerPixel)
    return window.ROOM_WORLD.units.list()
      .filter((candidate) => (
        candidate.alive
        && candidate.team !== unit.team
        && candidate.type !== unitType.MESSENGER
        && !candidate.isRetreat
      ))
      .map((candidate) => ({
        x: candidate.pos.x,
        y: candidate.pos.y,
        radiusPx,
      }))
  }

  private getThreatSignature(unit: BaseUnit): string {
    return window.ROOM_WORLD.units.list()
      .filter((candidate) => (
        candidate.alive
        && candidate.team !== unit.team
        && candidate.type !== unitType.MESSENGER
        && !candidate.isRetreat
      ))
      .map((candidate) => `${candidate.id}:${Math.round(candidate.pos.x)}:${Math.round(candidate.pos.y)}`)
      .sort()
      .join('|')
  }

  private hasPendingRetreatMove(unit: BaseUnit): boolean {
    return unit.getCommands().some((command) => {
      if (command.type !== UnitCommandTypes.Move || command.isFinished(unit)) return false
      const moveState = command.getState().state as MoveCommandState
      return moveState.comment === RetreatCommand.RETREAT_MOVE_COMMENT
    })
  }

  private removeRetreatMoves(unit: BaseUnit) {
    unit.setCommands(unit.getCommands().filter((command) => {
      if (command.type !== UnitCommandTypes.Move) return true
      const moveState = command.getState().state as MoveCommandState
      return moveState.comment !== RetreatCommand.RETREAT_MOVE_COMMENT
    }))
  }

  private hasThreatOnRetreatRoute(unit: BaseUnit): boolean {
    const threatZones = this.getThreatZones(unit)
    if (!threatZones.length) return false

    const routePoints = unit.getCommands()
      .filter((command) => {
        if (command.type !== UnitCommandTypes.Move || command.isFinished(unit)) return false
        const moveState = command.getState().state as MoveCommandState
        return moveState.comment === RetreatCommand.RETREAT_MOVE_COMMENT
      })
      .map((command) => (command.getState().state as MoveCommandState).target)
    let from = unit.pos
    for (const to of routePoints) {
      const segmentX = to.x - from.x
      const segmentY = to.y - from.y
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
      if (segmentLengthSquared === 0) continue
      for (const threat of threatZones) {
        const progress = (
          (threat.x - from.x) * segmentX
          + (threat.y - from.y) * segmentY
        ) / segmentLengthSquared
        if (progress <= 0 || progress > 1) continue
        const closestX = from.x + segmentX * progress
        const closestY = from.y + segmentY * progress
        if (Math.hypot(threat.x - closestX, threat.y - closestY) <= threat.radiusPx) {
          return true
        }
      }
      from = to
    }
    return false
  }

  private getRetreatTarget(unit: BaseUnit): vec2 | null {
    const enemy = window.ROOM_WORLD.units.list()
      .filter((candidate) => (
        candidate.alive
        && candidate.team !== unit.team
        && candidate.type !== unitType.MESSENGER
        && !candidate.isRetreat
      ))
      .sort((a, b) => {
        const aDistance = Math.hypot(a.pos.x - unit.pos.x, a.pos.y - unit.pos.y)
        const bDistance = Math.hypot(b.pos.x - unit.pos.x, b.pos.y - unit.pos.y)
        return aDistance - bDistance
      })[0]
    if (!enemy) return null

    let dx = unit.pos.x - enemy.pos.x
    let dy = unit.pos.y - enemy.pos.y
    const length = Math.hypot(dx, dy)
    if (length === 0) {
      dx = 1
      dy = 0
    } else {
      dx /= length
      dy /= length
    }

    const map = window.ROOM_WORLD.map
    const maxDistance = Math.min(
      dx > 0 ? (map.width - unit.pos.x) / dx : dx < 0 ? -unit.pos.x / dx : Infinity,
      dy > 0 ? (map.height - unit.pos.y) / dy : dy < 0 ? -unit.pos.y / dy : Infinity,
    )
    if (!Number.isFinite(maxDistance) || maxDistance <= 1) return null

    const retreatDistance = Math.min(
      maxDistance - 1,
      Math.max(Math.hypot(map.width, map.height) * 0.35, 300 / map.metersPerPixel),
    )
    if (retreatDistance <= 0) return null
    return {
      x: unit.pos.x + dx * retreatDistance,
      y: unit.pos.y + dy * retreatDistance,
    }
  }

  private ensureRetreatMoveCommands(unit: BaseUnit) {
    if (this.hasPendingRetreatMove(unit)) return
    const target = this.getRetreatTarget(unit)
    if (!target) return

    const threatZones = this.getThreatZones(unit)
    let routePoints = buildRoadTurnRoutePoints(
      window.ROOM_WORLD,
      unit.pos,
      target,
      {
        allowDirectFallback: false,
        threatZones,
      },
    )
    if (!routePoints.length && threatZones.length) {
      routePoints = buildRoadTurnRoutePoints(
        window.ROOM_WORLD,
        unit.pos,
        target,
        { allowDirectFallback: false },
      )
    }
    const movePoints = routePoints.length ? routePoints : [target]

    const uniqueId = crypto.randomUUID()
    const moveCommands = movePoints.map((point, segIndex) => new MoveCommand({
      target: { x: point.x, y: point.y },
      modifier: null,
      comment: RetreatCommand.RETREAT_MOVE_COMMENT,
      abilities: [],
      orderIndex: 0,
      uniqueId,
      segIndex,
      isPatrol: false,
    }))
    unit.setCommands([...unit.getCommands(), ...moveCommands])
    this.state.routeThreatSignature = this.getThreatSignature(unit)
  }

  update(unit: BaseUnit, dt: number) {
    this.state.elapsed += dt
    if (this.isFinished()) {
      this.removeRetreatMoves(unit)
    } else {
      const threatSignature = this.getThreatSignature(unit)
      if (
        this.hasThreatOnRetreatRoute(unit)
        && this.state.routeThreatSignature !== threatSignature
      ) {
        this.removeRetreatMoves(unit)
      }
      this.ensureRetreatMoveCommands(unit)
    }
    unit.setDirty()
  }

  isFinished(): boolean {
    if (this.state.duration === 0) return false;
    return Math.max(0, this.state.duration - this.state.elapsed) <= 0
  }

  estimate(unit: BaseUnit): number {
    if (this.state.duration === 0) return Infinity;
    return Math.max(0, this.state.duration - this.state.elapsed)
  }

  getState(): { type: UnitCommandTypes.Retreat; status: CommandStatus; state: RetreatCommandState } {
    return {
      type: this.type,
      status: this.status,
      state: this.state,
    }
  }
}


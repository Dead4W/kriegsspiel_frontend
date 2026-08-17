import type { BaseUnit } from '@/engine/units/baseUnit.ts'
import type { ChatMessage } from '@/engine/types/chatMessage.ts'
import type { commandstate, uuid } from '@/engine/units/types.ts'
import { UnitCommandTypes } from '@/engine/units/enums/UnitCommandTypes.ts'
import { MoveCommand, type MoveCommandState } from '@/engine/units/commands/moveCommand.ts'
import { AttackCommand } from '@/engine/units/commands/attackCommand.ts'
import { WaitCommand } from '@/engine/units/commands/waitCommand.ts'
import { RetreatCommand } from '@/engine/units/commands/retreatCommand.ts'
import { ChangeFormationCommand } from '@/engine/units/commands/changeFormationCommand.ts'
import { FollowCommand } from '@/engine/units/commands/followCommand.ts'
import { buildRoadTurnRoutePoints } from '@/engine/world/roadPath.ts'
import {
  applyUnitOrderStateNotes,
  readUnitOrderState,
} from '@/engine/units/orderStateNotes.ts'
import type { UnitOrderState } from '@/engine/units/orderStateNotes.ts'

/**
 * Commands written for one unit and carried on a chat message, to be executed
 * when the message reaches it.
 */
export type UnitOrderPlan = {
  unitId: uuid
  unitLabel?: string
  commands: commandstate[]
  notes?: string[]
  /** On-unit state the order sets; see `orderStateNotes.ts`. */
  state?: UnitOrderState
}

export type OrderCommand =
  | MoveCommand
  | AttackCommand
  | WaitCommand
  | RetreatCommand
  | ChangeFormationCommand
  | FollowCommand

/** A move may opt out of the road rebuild below. */
export type PlannedMoveCommandState = MoveCommandState & { ignoreRoads?: boolean }

/**
 * Turns serialized command states into command objects. Every type the engine
 * runs is handled here: a type that is silently dropped becomes an order the
 * sender believes was given and the unit never received, and formation is the
 * largest damage multiplier in the game.
 */
export function toOrderCommandObjects(rawCommands: unknown[]): OrderCommand[] {
  const commands: OrderCommand[] = []
  for (const raw of rawCommands) {
    if (!raw || typeof raw !== 'object') continue
    const state = raw as commandstate
    if (!state.state) continue
    if (state.type === UnitCommandTypes.Move) {
      commands.push(new MoveCommand(state.state as MoveCommandState))
    } else if (state.type === UnitCommandTypes.Attack) {
      commands.push(new AttackCommand(state.state as any))
    } else if (state.type === UnitCommandTypes.Wait) {
      commands.push(new WaitCommand(state.state as any))
    } else if (state.type === UnitCommandTypes.Retreat) {
      commands.push(new RetreatCommand(state.state as any))
    } else if (state.type === UnitCommandTypes.ChangeFormation) {
      commands.push(new ChangeFormationCommand(state.state as any))
    } else if (state.type === UnitCommandTypes.Follow) {
      commands.push(new FollowCommand(state.state as any))
    }
  }
  return commands
}

/**
 * Expands each move into the road route the unit will actually walk, so an
 * order authored as intent-level waypoints becomes the same segments the
 * engine would have produced. `orderIndex` is preserved because it carries the
 * unit's place in a column; the segment number goes in `segIndex`.
 */
export function rebuildMoveCommandsWithRoadPath(
  commands: OrderCommand[],
  unit: BaseUnit,
): OrderCommand[] {
  const roomWorld = window.ROOM_WORLD
  if (!roomWorld?.hasObjectNavMeshMap()) return commands

  const rebuilt: OrderCommand[] = []
  let currentPoint = { x: unit.pos.x, y: unit.pos.y }

  for (const command of commands) {
    if (command.type !== UnitCommandTypes.Move) {
      rebuilt.push(command)
      continue
    }
    const moveState = command.getState().state as PlannedMoveCommandState
    if (moveState.ignoreRoads) {
      rebuilt.push(command)
      currentPoint = { x: moveState.target.x, y: moveState.target.y }
      continue
    }
    const routePoints = buildRoadTurnRoutePoints(roomWorld, currentPoint, moveState.target)
    if (!routePoints.length) {
      rebuilt.push(command)
      currentPoint = { x: moveState.target.x, y: moveState.target.y }
      continue
    }
    routePoints.forEach((point, segIndex) => {
      rebuilt.push(new MoveCommand({
        ...moveState,
        target: { x: point.x, y: point.y },
        orderIndex: moveState.orderIndex,
        segIndex,
      }))
    })
    const tail = routePoints[routePoints.length - 1]!
    currentPoint = { x: tail.x, y: tail.y }
  }
  return rebuilt
}

export type ApplyOrderPlanOptions = {
  /**
   * Command types the unit keeps from its current queue. A unit that is
   * running from a lost morale check should not be marched back into the
   * fight by an order written before it broke.
   */
  preserveCommandTypes?: readonly UnitCommandTypes[]
  /**
   * Whether a plan carrying no commands still replaces the queue. On means an
   * empty plan is an order to stop; off means it only carries note state.
   */
  clearCommandsWhenEmpty?: boolean
  /** Skips units that are dead or already retreating. */
  skipUnavailableUnits?: boolean
  /** Marks the unit for the next outbound sync. */
  markDirty?: boolean
  /**
   * The message a unit's scheduled triggers are recorded against, when it is
   * not the message being applied.
   */
  sourceMessageIdByUnitId?: Record<string, string | null>
  /**
   * Set when the caller acts on the plan in ways this function cannot see, so
   * a plan with no commands and no state still counts as applied.
   */
  hasExternalEffects?: boolean
}

export function isUnitAvailableForOrders(unit: BaseUnit): boolean {
  return unit.alive && !unit.isRetreat
}

/**
 * Applies one unit's plan: its commands, then the state its notes carry.
 * Returns whether anything was applied.
 */
export function applyOrderPlanToUnit(
  message: ChatMessage,
  plan: UnitOrderPlan,
  unit: BaseUnit,
  options: ApplyOrderPlanOptions = {},
): boolean {
  if (options.skipUnavailableUnits && !isUnitAvailableForOrders(unit)) return false

  const rawCommands = Array.isArray(plan.commands) ? plan.commands : []
  const commands = rebuildMoveCommandsWithRoadPath(
    toOrderCommandObjects(rawCommands as unknown[]),
    unit,
  )
  const sourceMessageId = options.sourceMessageIdByUnitId?.[unit.id] || message.id
  const orderState = readUnitOrderState(plan.state, plan.notes, sourceMessageId)
  const hasStateChanges = orderState.autoAttack != null
    || orderState.periodicBatch != null
    || orderState.triggers.hasDirective
  const replacesQueue = commands.length > 0 || Boolean(options.clearCommandsWhenEmpty)

  if (!replacesQueue && !hasStateChanges && !options.hasExternalEffects) return false

  if (replacesQueue) {
    const preserved = options.preserveCommandTypes?.length
      ? unit.getCommands().filter((command) => (
        options.preserveCommandTypes!.includes(command.type as UnitCommandTypes)
      ))
      : []
    unit.manualEnvironment = null
    unit.setCommands([...preserved, ...commands])
  }

  applyUnitOrderStateNotes(unit, orderState)

  if (options.markDirty) {
    unit.setDirty()
    window.ROOM_WORLD.units.withNewCommandsTmp.add(unit.id)
  }
  return true
}

/**
 * Applies a plan to a unit its own side has in hand, with nothing carrying it.
 *
 * During planning a side arranges its own force directly — the orders written
 * then are not sent anywhere and cost nothing, because there is no distance
 * between the man giving them and the men taking them. They still have to be
 * applied the same way a delivered order is, or a move written now would skip
 * the road builder and take a different route from the identical move written
 * an hour later.
 */
export function applyLocalOrderPlan(
  plan: UnitOrderPlan,
  unit: BaseUnit,
  options: ApplyOrderPlanOptions = {},
): boolean {
  const local = {
    id: `local:${unit.id}`,
    time: window.ROOM_WORLD.time,
  } as unknown as ChatMessage
  return applyOrderPlanToUnit(local, plan, unit, options)
}

/**
 * Applies a set of plans and reports how many units took an order. Plans for
 * units that are not on the board are skipped rather than treated as errors:
 * an order can outlive the unit it was written for.
 */
export function applyOrderPlans(
  message: ChatMessage,
  plans: UnitOrderPlan[],
  options: ApplyOrderPlanOptions = {},
): number {
  let applied = 0
  for (const plan of plans) {
    const unit = window.ROOM_WORLD.units.get(plan.unitId)
    if (!unit) continue
    if (applyOrderPlanToUnit(message, plan, unit, options)) applied += 1
  }
  return applied
}
